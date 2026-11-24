import express from 'express';
import { z } from 'zod';
import { many, one, pool, query, transaction } from '../db/pool.js';
import { forbidden, HttpError, notFound, parse } from '../lib/http.js';
import { isValidCpf, onlyDigits } from '../lib/security.js';
import { requireAuth, requireVerifiedEmail } from '../middleware/auth.js';
import * as mpgw from '../services/mercadopago.js';
import {
  applyGatewayPayment, cancelOrder, getOrderDetail, sendOrderCreatedEmail, serializeOrder, startPayment, syncOrderPayment,
} from '../services/orders.js';
import { buildQuote } from '../services/pricing.js';

const router = express.Router();

const itemsSchema = z
  .array(z.object({ variantId: z.coerce.number().int().positive(), quantity: z.coerce.number().int().min(1).max(10) }))
  .max(50, 'Carrinho grande demais');

/** Orçamento do carrinho: preços atuais, estoque, cupom e frete. */
router.post('/cart/quote', async (req, res) => {
  const data = parse(
    z.object({
      items: itemsSchema.default([]),
      couponCode: z.string().max(40).optional().nullable(),
      cep: z.string().max(9).optional().nullable(),
      shippingMethod: z.string().max(20).optional().nullable(),
    }),
    req.body,
  );
  res.json(await buildQuote(pool, data));
});

const PAYMENT_METHODS = ['pix', 'card', 'boleto'];

router.post('/orders', requireVerifiedEmail, async (req, res) => {
  const data = parse(
    z.object({
      items: itemsSchema.min(1, 'Seu carrinho está vazio'),
      addressId: z.coerce.number({ invalid_type_error: 'Escolha um endereço' }).int().positive('Escolha um endereço'),
      shippingMethod: z.string({ required_error: 'Escolha a entrega' }).min(1, 'Escolha a entrega'),
      paymentMethod: z.enum(PAYMENT_METHODS, { errorMap: () => ({ message: 'Escolha a forma de pagamento' }) }),
      couponCode: z.string().max(40).optional().nullable(),
      cpf: z.string().optional().nullable(),
    }),
    req.body,
  );
  const user = req.user;

  if (data.paymentMethod === 'boleto' && !user.cpf) {
    const cpf = onlyDigits(data.cpf);
    if (!isValidCpf(cpf)) throw new HttpError(422, 'Informe um CPF válido para pagar com boleto.', { fields: { cpf: 'CPF inválido' } });
    const taken = await one('SELECT 1 FROM users WHERE cpf = $1 AND id <> $2', [cpf, user.id]);
    if (taken) throw new HttpError(409, 'Este CPF já está em outra conta.', { fields: { cpf: 'CPF já cadastrado' } });
    await query('UPDATE users SET cpf = $1, updated_at = now() WHERE id = $2', [cpf, user.id]);
  }

  const address = await one('SELECT * FROM addresses WHERE id = $1 AND user_id = $2', [data.addressId, user.id]);
  if (!address) throw new HttpError(422, 'Escolha um endereço de entrega.', { fields: { addressId: 'Endereço inválido' } });

  const orderId = await transaction(async (db) => {
    const quote = await buildQuote(db, { ...data, cep: address.cep, lock: true });
    if (quote.issues.length) {
      throw new HttpError(409, 'Alguns itens mudaram de estoque. Revise o carrinho.', { issues: quote.issues });
    }
    if (data.couponCode && quote.couponError) throw new HttpError(422, quote.couponError, { fields: { couponCode: quote.couponError } });
    if (!quote.shipping) throw new HttpError(422, 'Escolha uma forma de entrega.', { fields: { shippingMethod: 'Obrigatório' } });

    const snapshot = {
      recipient: address.recipient, cep: address.cep, street: address.street, number: address.number,
      complement: address.complement, district: address.district, city: address.city, state: address.state,
    };
    const order = await one(
      `INSERT INTO orders (user_id, subtotal_cents, discount_cents, shipping_cents, total_cents, coupon_id, coupon_code,
                           shipping_method, shipping_label, shipping_days, shipping_address, payment_method)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [user.id, quote.subtotalCents, quote.discountCents, quote.shipping.priceCents, quote.totalCents, quote.coupon?.id || null,
        quote.coupon?.code || null, quote.shipping.id, quote.shipping.label, quote.shipping.days, JSON.stringify(snapshot), data.paymentMethod],
      db,
    );
    for (const l of quote.lines) {
      await db.query(
        `INSERT INTO order_items (order_id, product_id, variant_id, product_name, product_slug, size, color_name, image_url, unit_price_cents, quantity)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [order.id, l.productId, l.variantId, l.name, l.slug, l.size, l.color, l.image, l.unitPriceCents, l.quantity],
      );
      const upd = await db.query('UPDATE product_variants SET stock = stock - $1 WHERE id = $2 AND stock >= $1', [l.quantity, l.variantId]);
      if (upd.rowCount !== 1) throw new HttpError(409, `${l.name} ficou sem estoque. Revise o carrinho.`);
    }
    if (quote.coupon) {
      const c = await db.query('UPDATE coupons SET used_count = used_count + 1 WHERE id = $1 AND (max_uses IS NULL OR used_count < max_uses)', [quote.coupon.id]);
      if (c.rowCount !== 1) throw new HttpError(422, 'Este cupom atingiu o limite de usos.');
    }
    await db.query('INSERT INTO order_status_history (order_id, status, note) VALUES ($1, $2, $3)', [order.id, 'aguardando_pagamento', 'Pedido criado']);
    return order.id;
  });

  await startPayment(orderId, data.paymentMethod);
  sendOrderCreatedEmail(orderId);
  res.status(201).json({ order: await getOrderDetail(orderId) });
});

router.get('/orders', requireAuth, async (req, res) => {
  const rows = await many(
    `SELECT o.*, (SELECT COALESCE(SUM(quantity),0)::int FROM order_items WHERE order_id = o.id) AS item_count
       FROM orders o WHERE o.user_id = $1 ORDER BY o.created_at DESC`,
    [req.user.id],
  );
  const firstItems = await many(
    `SELECT DISTINCT ON (order_id) order_id, image_url, product_name FROM order_items
      WHERE order_id = ANY($1::int[]) ORDER BY order_id, id`,
    [rows.map((r) => r.id).length ? rows.map((r) => r.id) : [0]],
  );
  const imgs = new Map(firstItems.map((i) => [i.order_id, i]));
  res.json({ orders: rows.map((o) => ({ ...serializeOrder(o), preview: imgs.get(o.id) || null })) });
});

async function loadOwnOrder(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw notFound('Pedido não encontrado.');
  const o = await one('SELECT id, user_id, status FROM orders WHERE id = $1', [id]);
  if (!o) throw notFound('Pedido não encontrado.');
  if (o.user_id !== req.user.id && req.user.role !== 'admin') throw forbidden('Este pedido não é da sua conta.');
  return o;
}

router.get('/orders/:id', requireAuth, async (req, res) => {
  const o = await loadOwnOrder(req);
  res.json({ order: await getOrderDetail(o.id) });
});

router.post('/orders/:id/pay', requireAuth, async (req, res) => {
  const o = await loadOwnOrder(req);
  const { method } = parse(z.object({ method: z.enum(PAYMENT_METHODS) }), req.body);
  await startPayment(o.id, method);
  res.json({ order: await getOrderDetail(o.id) });
});

router.post('/orders/:id/payment/refresh', requireAuth, async (req, res) => {
  const o = await loadOwnOrder(req);
  await syncOrderPayment(o.id);
  res.json({ order: await getOrderDetail(o.id) });
});

router.post('/orders/:id/cancel', requireAuth, async (req, res) => {
  const o = await loadOwnOrder(req);
  if (o.status !== 'aguardando_pagamento') throw new HttpError(409, 'Só é possível cancelar pedidos que ainda aguardam pagamento.');
  await cancelOrder(o.id, 'Cancelado pelo cliente');
  res.json({ order: await getOrderDetail(o.id) });
});

/** Webhook do Mercado Pago: confirma o status consultando a API (nunca confia só no corpo). */
router.post('/payments/webhook/mercadopago', async (req, res) => {
  const dataId = String(req.query['data.id'] || req.body?.data?.id || '');
  const type = String(req.query.type || req.body?.type || '');
  if (!mpgw.isConfigured()) return res.status(503).json({ error: 'Gateway de pagamento não configurado.' });
  if (!dataId) return res.status(200).json({ ignored: true });
  if (!mpgw.verifyWebhookSignature(req, dataId)) return res.status(401).json({ error: 'Assinatura inválida.' });
  if (type && type !== 'payment') return res.status(200).json({ ignored: true });
  try {
    await applyGatewayPayment(await mpgw.getPayment(dataId));
  } catch (err) {
    console.error('[webhook] falha ao processar', err.message);
    return res.status(500).json({ error: 'Falha ao processar' });
  }
  res.status(200).json({ ok: true });
});

router.get('/payments/config', (_req, res) => {
  res.json({ provider: 'mercadopago', configured: mpgw.isConfigured(), testMode: mpgw.isTestMode() });
});

export default router;
