import { config } from '../config.js';
import { many, one, query, transaction } from '../db/pool.js';
import { HttpError, notFound } from '../lib/http.js';
import { sendMail, templates } from '../lib/mailer.js';
import { getSettings } from '../lib/settings.js';
import * as mpgw from './mercadopago.js';

export const STATUS_LABELS = {
  aguardando_pagamento: 'Aguardando pagamento',
  pago: 'Pagamento aprovado',
  em_separacao: 'Em separação',
  enviado: 'Enviado',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

const brl = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function serializeOrder(o) {
  return {
    id: o.id,
    status: o.status,
    statusLabel: STATUS_LABELS[o.status],
    subtotalCents: o.subtotal_cents,
    discountCents: o.discount_cents,
    shippingCents: o.shipping_cents,
    totalCents: o.total_cents,
    couponCode: o.coupon_code,
    shippingMethod: o.shipping_method,
    shippingLabel: o.shipping_label,
    shippingDays: o.shipping_days,
    shippingAddress: o.shipping_address,
    paymentMethod: o.payment_method,
    trackingCode: o.tracking_code,
    paidAt: o.paid_at,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
    itemCount: o.item_count,
    customer: o.customer_name ? { id: o.user_id, name: o.customer_name, email: o.customer_email, phone: o.customer_phone } : undefined,
  };
}

export function serializePayment(p) {
  if (!p) return null;
  return {
    id: p.id,
    method: p.method,
    status: p.status,
    amountCents: p.amount_cents,
    providerPaymentId: p.provider_payment_id,
    pixQrCode: p.pix_qr_code,
    pixQrBase64: p.pix_qr_base64,
    ticketUrl: p.ticket_url,
    checkoutUrl: p.checkout_url,
    barcode: p.barcode,
    expiresAt: p.expires_at,
    errorMessage: p.error_message,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}

export async function getOrderDetail(orderId) {
  const o = await one(
    `SELECT o.*, u.name AS customer_name, u.email AS customer_email, u.phone AS customer_phone
       FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = $1`,
    [orderId],
  );
  if (!o) throw notFound('Pedido não encontrado.');
  const items = await many('SELECT * FROM order_items WHERE order_id = $1 ORDER BY id', [orderId]);
  const history = await many('SELECT status, note, created_at FROM order_status_history WHERE order_id = $1 ORDER BY id', [orderId]);
  const payment = await one('SELECT * FROM payments WHERE order_id = $1 ORDER BY id DESC LIMIT 1', [orderId]);
  return {
    ...serializeOrder(o),
    items: items.map((i) => ({
      id: i.id,
      productId: i.product_id,
      variantId: i.variant_id,
      name: i.product_name,
      slug: i.product_slug,
      size: i.size,
      color: i.color_name,
      image: i.image_url,
      unitPriceCents: i.unit_price_cents,
      quantity: i.quantity,
      lineTotalCents: i.unit_price_cents * i.quantity,
    })),
    history: history.map((h) => ({ status: h.status, label: STATUS_LABELS[h.status], note: h.note, createdAt: h.created_at })),
    payment: serializePayment(payment),
    gateway: { configured: mpgw.isConfigured(), testMode: mpgw.isTestMode() },
  };
}

async function notifyStatus(orderId, status) {
  try {
    const o = await one('SELECT o.id, u.name, u.email FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = $1', [orderId]);
    const { store } = await getSettings();
    const t = templates.orderStatus(store.name, o.name.split(' ')[0], o.id, STATUS_LABELS[status], `${config.appUrl}/pedido/${o.id}`);
    await sendMail({ to: o.email, ...t });
  } catch (err) {
    console.error('[e-mail] falha ao notificar status', err.message);
  }
}

/** Cancela o pedido devolvendo o estoque e o uso do cupom. */
export async function cancelOrder(orderId, note) {
  const result = await transaction(async (db) => {
    const o = await one('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId], db);
    if (!o) throw notFound('Pedido não encontrado.');
    if (o.status === 'cancelado') return o;
    if (['enviado', 'entregue'].includes(o.status)) throw new HttpError(409, 'Pedidos já enviados não podem ser cancelados.');
    const items = await many('SELECT variant_id, quantity FROM order_items WHERE order_id = $1', [orderId], db);
    for (const it of items) {
      if (it.variant_id) await db.query('UPDATE product_variants SET stock = stock + $1 WHERE id = $2', [it.quantity, it.variant_id]);
    }
    if (o.coupon_id) await db.query('UPDATE coupons SET used_count = GREATEST(used_count - 1, 0) WHERE id = $1', [o.coupon_id]);
    if (o.status !== 'aguardando_pagamento') {
      // pedido já pago: desfaz a contagem de vendidos
      for (const it of await many('SELECT product_id, quantity FROM order_items WHERE order_id = $1', [orderId], db)) {
        if (it.product_id) await db.query('UPDATE products SET sold_count = GREATEST(sold_count - $1, 0) WHERE id = $2', [it.quantity, it.product_id]);
      }
    }
    await db.query(`UPDATE orders SET status = 'cancelado', updated_at = now() WHERE id = $1`, [orderId]);
    await db.query('INSERT INTO order_status_history (order_id, status, note) VALUES ($1, $2, $3)', [orderId, 'cancelado', note || '']);
    return o;
  });
  // tenta cancelar cobranças pendentes no gateway (PIX/boleto)
  const pending = await many(
    `SELECT provider_payment_id FROM payments WHERE order_id = $1 AND status = 'pending' AND provider_payment_id IS NOT NULL`,
    [orderId],
  );
  for (const p of pending) {
    try {
      await mpgw.cancelPayment(p.provider_payment_id);
    } catch (err) {
      console.error('[pagamento] não foi possível cancelar no gateway', err.message);
    }
  }
  await query(`UPDATE payments SET status = 'cancelled', updated_at = now() WHERE order_id = $1 AND status IN ('pending','not_configured','error')`, [orderId]);
  if (result.status !== 'cancelado') notifyStatus(orderId, 'cancelado');
}

const FLOW = ['aguardando_pagamento', 'pago', 'em_separacao', 'enviado', 'entregue'];

/** Atualiza o status (uso administrativo). */
export async function updateOrderStatus(orderId, status, { note = '', trackingCode } = {}) {
  if (status === 'cancelado') return cancelOrder(orderId, note || 'Cancelado pela loja');
  await transaction(async (db) => {
    const o = await one('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId], db);
    if (!o) throw notFound('Pedido não encontrado.');
    if (o.status === 'cancelado') throw new HttpError(409, 'Pedidos cancelados não podem mudar de status.');
    if (FLOW.indexOf(status) < FLOW.indexOf(o.status)) throw new HttpError(409, 'O status não pode voltar para uma etapa anterior.');
    if (status === 'enviado' && !(trackingCode || o.tracking_code)) {
      throw new HttpError(422, 'Informe o código de rastreio para marcar como enviado.', { fields: { trackingCode: 'Obrigatório para envio' } });
    }
    const becamePaid = o.status === 'aguardando_pagamento' && status !== 'aguardando_pagamento';
    await db.query(
      `UPDATE orders SET status = $1, tracking_code = COALESCE($2, tracking_code),
              paid_at = CASE WHEN $3::boolean THEN now() ELSE paid_at END, updated_at = now() WHERE id = $4`,
      [status, trackingCode || null, becamePaid, orderId],
    );
    if (becamePaid) await incrementSold(db, orderId);
    if (status !== o.status) {
      await db.query('INSERT INTO order_status_history (order_id, status, note) VALUES ($1, $2, $3)', [orderId, status, note]);
    }
  });
  notifyStatus(orderId, status);
}

async function incrementSold(db, orderId) {
  const items = await many('SELECT product_id, quantity FROM order_items WHERE order_id = $1', [orderId], db);
  for (const it of items) {
    if (it.product_id) await db.query('UPDATE products SET sold_count = sold_count + $1 WHERE id = $2', [it.quantity, it.product_id]);
  }
}

/** Cria uma cobrança no gateway para o pedido. Nunca marca como pago sem confirmação do gateway. */
export async function startPayment(orderId, method) {
  const order = await one('SELECT * FROM orders WHERE id = $1', [orderId]);
  if (!order) throw notFound('Pedido não encontrado.');
  if (order.status !== 'aguardando_pagamento') throw new HttpError(409, 'Este pedido não está aguardando pagamento.');
  const user = await one('SELECT * FROM users WHERE id = $1', [order.user_id]);

  if (method !== order.payment_method) {
    await query('UPDATE orders SET payment_method = $1, updated_at = now() WHERE id = $2', [method, orderId]);
  }
  // invalida cobranças anteriores ainda em aberto
  await query(`UPDATE payments SET status = 'cancelled', updated_at = now() WHERE order_id = $1 AND status IN ('pending','not_configured','error')`, [orderId]);

  const base = { order_id: orderId, method, amount_cents: order.total_cents };
  if (!mpgw.isConfigured()) {
    return insertPayment({ ...base, status: 'not_configured', error_message: 'Gateway de pagamento não configurado (MP_ACCESS_TOKEN).' });
  }
  try {
    let r;
    if (method === 'pix') r = await mpgw.createPix(order, user);
    else if (method === 'boleto') r = await mpgw.createBoleto(order, user, order.shipping_address);
    else r = await mpgw.createCardCheckout(order, user);
    return insertPayment({
      ...base,
      status: r.status,
      provider_payment_id: r.providerPaymentId || null,
      preference_id: r.preferenceId || null,
      pix_qr_code: r.pixQrCode || null,
      pix_qr_base64: r.pixQrBase64 || null,
      ticket_url: r.ticketUrl || null,
      checkout_url: r.checkoutUrl || null,
      barcode: r.barcode || null,
      expires_at: r.expiresAt || null,
      raw: r.raw,
    });
  } catch (err) {
    if (err.extra?.code === 'CPF_REQUIRED') throw err;
    console.error('[pagamento] falha ao criar cobrança', err.message);
    return insertPayment({ ...base, status: 'error', error_message: err.message, raw: err.gateway || null });
  }
}

async function insertPayment(p) {
  const cols = Object.keys(p);
  const vals = cols.map((c) => (c === 'raw' && p[c] ? JSON.stringify(p[c]) : p[c]));
  const row = await one(
    `INSERT INTO payments (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`,
    vals,
  );
  return serializePayment(row);
}

/** Aplica o estado real de um pagamento consultado no gateway. */
export async function applyGatewayPayment(mpPayment) {
  const orderId = Number(mpPayment.external_reference);
  if (!Number.isInteger(orderId)) return;
  const status = mpgw.mapStatus(mpPayment.status);
  const providerId = String(mpPayment.id);

  const transition = await transaction(async (db) => {
    const order = await one('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId], db);
    if (!order) return null;
    let pay = await one(`SELECT * FROM payments WHERE provider = 'mercadopago' AND provider_payment_id = $1`, [providerId], db);
    if (!pay) {
      // pagamento via Checkout Pro: vincula ao registro da preferência
      pay = await one(
        `SELECT * FROM payments WHERE order_id = $1 AND method = 'card' AND provider_payment_id IS NULL ORDER BY id DESC LIMIT 1`,
        [orderId],
        db,
      );
    }
    if (!pay) {
      pay = await one(
        `INSERT INTO payments (order_id, method, status, amount_cents, provider_payment_id) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [orderId, order.payment_method, status, order.total_cents, providerId],
        db,
      );
    }
    await db.query(
      `UPDATE payments SET status = $1, provider_payment_id = $2, raw = $3, updated_at = now() WHERE id = $4`,
      [status, providerId, JSON.stringify(mpPayment), pay.id],
    );
    const paidCents = Math.round(Number(mpPayment.transaction_amount || 0) * 100);
    if (status === 'approved' && order.status === 'aguardando_pagamento') {
      if (paidCents < order.total_cents) {
        console.error(`[pagamento] valor aprovado (${paidCents}) menor que o total do pedido #${orderId}`);
        return null;
      }
      await db.query(`UPDATE orders SET status = 'pago', paid_at = now(), updated_at = now() WHERE id = $1`, [orderId]);
      await db.query('INSERT INTO order_status_history (order_id, status, note) VALUES ($1, $2, $3)', [orderId, 'pago', `Confirmado pelo Mercado Pago (${providerId})`]);
      await incrementSold(db, orderId);
      return 'pago';
    }
    return null;
  });
  if (transition) notifyStatus(orderId, transition);
}

/** Consulta o gateway e atualiza o pagamento do pedido (usado pelo botão "Verificar pagamento"). */
export async function syncOrderPayment(orderId) {
  if (!mpgw.isConfigured()) return;
  const pay = await one('SELECT * FROM payments WHERE order_id = $1 ORDER BY id DESC LIMIT 1', [orderId]);
  if (!pay) return;
  if (pay.provider_payment_id) {
    await applyGatewayPayment(await mpgw.getPayment(pay.provider_payment_id));
  } else if (pay.method === 'card') {
    const results = await mpgw.findPaymentsByReference(orderId);
    for (const r of results.reverse()) await applyGatewayPayment(r);
  }
}

export async function sendOrderCreatedEmail(orderId) {
  try {
    const o = await one('SELECT o.id, o.total_cents, u.name, u.email FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = $1', [orderId]);
    const { store } = await getSettings();
    const t = templates.orderCreated(store.name, o.name.split(' ')[0], o.id, brl(o.total_cents), `${config.appUrl}/pedido/${o.id}`);
    await sendMail({ to: o.email, ...t });
  } catch (err) {
    console.error('[e-mail] falha ao enviar confirmação do pedido', err.message);
  }
}
