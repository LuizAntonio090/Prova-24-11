import express from 'express';
import { z } from 'zod';
import { many, one, query } from '../../db/pool.js';
import { HttpError, notFound, parse, slugify, toInt } from '../../lib/http.js';
import { DEFAULT_SETTINGS, getSettings, saveSetting } from '../../lib/settings.js';
import { STATUS_LABELS, getOrderDetail, serializeOrder, updateOrderStatus } from '../../services/orders.js';

const router = express.Router();

// ---------- Dashboard ----------
const PAID = `o.status IN ('pago','em_separacao','enviado','entregue')`;

router.get('/dashboard', async (_req, res) => {
  const [month, prevMonth, today, counts, customers, lowStock, recent, daily, top] = await Promise.all([
    one(`SELECT COALESCE(SUM(total_cents),0)::int AS revenue, count(*)::int AS orders FROM orders o WHERE ${PAID} AND o.paid_at >= date_trunc('month', now())`),
    one(`SELECT COALESCE(SUM(total_cents),0)::int AS revenue FROM orders o WHERE ${PAID} AND o.paid_at >= date_trunc('month', now()) - interval '1 month' AND o.paid_at < date_trunc('month', now())`),
    one(`SELECT COALESCE(SUM(total_cents),0)::int AS revenue, count(*)::int AS orders FROM orders o WHERE ${PAID} AND o.paid_at >= date_trunc('day', now())`),
    many(`SELECT status, count(*)::int AS n FROM orders GROUP BY status`),
    one(`SELECT count(*)::int AS total, count(*) FILTER (WHERE created_at >= date_trunc('month', now()))::int AS month FROM users WHERE role = 'customer'`),
    many(`SELECT v.id, p.name, v.size, v.color_name, v.stock FROM product_variants v JOIN products p ON p.id = v.product_id WHERE p.active AND v.stock <= 3 ORDER BY v.stock, p.name LIMIT 8`),
    many(`SELECT o.*, u.name AS customer_name, u.email AS customer_email FROM orders o JOIN users u ON u.id = o.user_id ORDER BY o.created_at DESC LIMIT 6`),
    many(`SELECT to_char(d, 'YYYY-MM-DD') AS day,
                 COALESCE((SELECT SUM(total_cents) FROM orders o WHERE ${PAID} AND o.paid_at::date = d::date),0)::int AS revenue
            FROM generate_series(current_date - interval '13 days', current_date, interval '1 day') d ORDER BY d`),
    many(`SELECT oi.product_name AS name, SUM(oi.quantity)::int AS qty, SUM(oi.quantity * oi.unit_price_cents)::int AS revenue
            FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE ${PAID} AND o.paid_at >= now() - interval '30 days'
           GROUP BY oi.product_name ORDER BY qty DESC LIMIT 5`),
  ]);
  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c.n]));
  res.json({
    revenueMonthCents: month.revenue,
    revenuePrevMonthCents: prevMonth.revenue,
    ordersMonth: month.orders,
    avgTicketCents: month.orders ? Math.round(month.revenue / month.orders) : 0,
    revenueTodayCents: today.revenue,
    ordersToday: today.orders,
    customersTotal: customers.total,
    customersMonth: customers.month,
    ordersByStatus: byStatus,
    awaitingPayment: byStatus.aguardando_pagamento || 0,
    toShip: (byStatus.pago || 0) + (byStatus.em_separacao || 0),
    lowStock: lowStock.map((v) => ({ id: v.id, name: v.name, size: v.size, color: v.color_name, stock: v.stock })),
    recentOrders: recent.map(serializeOrder),
    daily,
    topProducts: top,
  });
});

// ---------- Relatórios ----------
router.get('/reports', async (req, res) => {
  const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.de || '') ? req.query.de : new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(req.query.ate || '') ? req.query.ate : new Date().toISOString().slice(0, 10);
  const range = `${PAID} AND o.paid_at::date BETWEEN $1::date AND $2::date`;
  const p = [from, to];
  const [totals, daily, byCategory, byPayment, byProduct, cancelled] = await Promise.all([
    one(`SELECT COALESCE(SUM(total_cents),0)::int AS revenue, count(*)::int AS orders, COALESCE(SUM(discount_cents),0)::int AS discounts,
                COALESCE(SUM(shipping_cents),0)::int AS shipping FROM orders o WHERE ${range}`, p),
    many(`SELECT to_char(d, 'YYYY-MM-DD') AS day,
                 COALESCE((SELECT SUM(total_cents) FROM orders o WHERE ${PAID} AND o.paid_at::date = d::date),0)::int AS revenue,
                 (SELECT count(*) FROM orders o WHERE ${PAID} AND o.paid_at::date = d::date)::int AS orders
            FROM generate_series($1::date, $2::date, interval '1 day') d ORDER BY d`, p),
    many(`SELECT c.name, SUM(oi.quantity)::int AS qty, SUM(oi.quantity * oi.unit_price_cents)::int AS revenue
            FROM order_items oi JOIN orders o ON o.id = oi.order_id
            JOIN product_categories pc ON pc.product_id = oi.product_id JOIN categories c ON c.id = pc.category_id AND c.kind = 'tipo'
           WHERE ${range} GROUP BY c.name ORDER BY revenue DESC`, p),
    many(`SELECT o.payment_method AS method, count(*)::int AS orders, SUM(o.total_cents)::int AS revenue FROM orders o WHERE ${range} GROUP BY o.payment_method ORDER BY revenue DESC`, p),
    many(`SELECT oi.product_name AS name, SUM(oi.quantity)::int AS qty, SUM(oi.quantity * oi.unit_price_cents)::int AS revenue
            FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE ${range} GROUP BY oi.product_name ORDER BY revenue DESC LIMIT 15`, p),
    one(`SELECT count(*)::int AS n FROM orders o WHERE o.status = 'cancelado' AND o.updated_at::date BETWEEN $1::date AND $2::date`, p),
  ]);
  res.json({
    from, to,
    revenueCents: totals.revenue, orders: totals.orders, discountsCents: totals.discounts, shippingCents: totals.shipping,
    avgTicketCents: totals.orders ? Math.round(totals.revenue / totals.orders) : 0,
    cancelledOrders: cancelled.n,
    daily, byCategory, byPayment, byProduct,
  });
});

// ---------- Pedidos ----------
router.get('/orders', async (req, res) => {
  const params = [];
  const where = ['true'];
  if (req.query.status && STATUS_LABELS[req.query.status]) {
    params.push(req.query.status);
    where.push(`o.status = $${params.length}`);
  }
  if (req.query.q) {
    const q = String(req.query.q).trim();
    params.push(`%${q}%`);
    const idx = params.length;
    const asId = Number(q.replace('#', ''));
    where.push(`(u.name ILIKE $${idx} OR u.email ILIKE $${idx}${Number.isInteger(asId) && asId > 0 ? ` OR o.id = ${asId}` : ''})`);
  }
  const page = Math.max(1, toInt(req.query.pagina, 1));
  const limit = 20;
  const [rows, count] = await Promise.all([
    many(
      `SELECT o.*, u.name AS customer_name, u.email AS customer_email, u.phone AS customer_phone,
              (SELECT COALESCE(SUM(quantity),0)::int FROM order_items WHERE order_id = o.id) AS item_count
         FROM orders o JOIN users u ON u.id = o.user_id WHERE ${where.join(' AND ')}
        ORDER BY o.created_at DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
      params,
    ),
    one(`SELECT count(*)::int AS n FROM orders o JOIN users u ON u.id = o.user_id WHERE ${where.join(' AND ')}`, params),
  ]);
  res.json({ items: rows.map(serializeOrder), total: count.n, page, pages: Math.max(1, Math.ceil(count.n / limit)) });
});

router.get('/orders/:id', async (req, res) => {
  res.json({ order: await getOrderDetail(Number(req.params.id)) });
});

router.patch('/orders/:id/status', async (req, res) => {
  const data = parse(
    z.object({
      status: z.enum(Object.keys(STATUS_LABELS), { errorMap: () => ({ message: 'Status inválido' }) }),
      note: z.string().max(300).optional().default(''),
      trackingCode: z.string().trim().max(60).optional().nullable(),
    }),
    req.body,
  );
  await updateOrderStatus(Number(req.params.id), data.status, data);
  res.json({ order: await getOrderDetail(Number(req.params.id)) });
});

// ---------- Clientes ----------
router.get('/customers', async (req, res) => {
  const params = [];
  let where = `u.role = 'customer'`;
  if (req.query.q) {
    params.push(`%${String(req.query.q).trim()}%`);
    where += ` AND (u.name ILIKE $1 OR u.email ILIKE $1 OR u.phone ILIKE $1)`;
  }
  const page = Math.max(1, toInt(req.query.pagina, 1));
  const limit = 25;
  const [rows, count] = await Promise.all([
    many(
      `SELECT u.id, u.name, u.email, u.phone, u.cpf, u.email_verified_at, u.created_at,
              (SELECT count(*) FROM orders o WHERE o.user_id = u.id)::int AS orders,
              (SELECT COALESCE(SUM(total_cents),0) FROM orders o WHERE o.user_id = u.id AND ${PAID})::int AS spent
         FROM users u WHERE ${where} ORDER BY u.created_at DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
      params,
    ),
    one(`SELECT count(*)::int AS n FROM users u WHERE ${where}`, params),
  ]);
  res.json({
    items: rows.map((u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, cpf: u.cpf, emailVerified: Boolean(u.email_verified_at), createdAt: u.created_at, orders: u.orders, spentCents: u.spent })),
    total: count.n, page, pages: Math.max(1, Math.ceil(count.n / limit)),
  });
});

router.get('/customers/:id', async (req, res) => {
  const u = await one(`SELECT * FROM users WHERE id = $1 AND role = 'customer'`, [Number(req.params.id)]);
  if (!u) throw notFound('Cliente não encontrado.');
  const [orders, addresses] = await Promise.all([
    many(`SELECT o.*, (SELECT COALESCE(SUM(quantity),0)::int FROM order_items WHERE order_id = o.id) AS item_count FROM orders o WHERE user_id = $1 ORDER BY created_at DESC`, [u.id]),
    many('SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, id', [u.id]),
  ]);
  res.json({
    customer: { id: u.id, name: u.name, email: u.email, phone: u.phone, cpf: u.cpf, emailVerified: Boolean(u.email_verified_at), createdAt: u.created_at },
    orders: orders.map(serializeOrder),
    addresses: addresses.map((a) => ({ id: a.id, label: a.label, line: `${a.street}, ${a.number}${a.complement ? ' — ' + a.complement : ''}, ${a.district}, ${a.city}/${a.state} · CEP ${a.cep}` })),
  });
});

// ---------- Categorias ----------
const categorySchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome').max(60),
  slug: z.string().trim().max(60).optional().default(''),
  kind: z.enum(['departamento', 'tipo'], { errorMap: () => ({ message: 'Escolha o tipo' }) }),
  description: z.string().trim().max(300).optional().default(''),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  active: z.boolean().default(true),
});
const RESERVED = ['promocoes', 'lancamentos', 'mais-vendidos'];

router.get('/categories', async (_req, res) => {
  const rows = await many(`SELECT c.*, (SELECT count(*) FROM product_categories pc WHERE pc.category_id = c.id)::int AS products FROM categories c ORDER BY c.kind, c.sort_order, c.name`);
  res.json({ items: rows.map((c) => ({ id: c.id, name: c.name, slug: c.slug, kind: c.kind, description: c.description, sortOrder: c.sort_order, active: c.active, products: c.products })) });
});

async function saveCategory(data, id) {
  const slug = slugify(data.slug || data.name);
  if (!slug || RESERVED.includes(slug)) throw new HttpError(422, 'Escolha outro endereço (slug) para a categoria.', { fields: { slug: 'Endereço reservado' } });
  const vals = [data.name, slug, data.kind, data.description, data.sortOrder, data.active];
  if (id) {
    const r = await one('UPDATE categories SET name=$1, slug=$2, kind=$3, description=$4, sort_order=$5, active=$6 WHERE id=$7 RETURNING id', [...vals, id]);
    if (!r) throw notFound('Categoria não encontrada.');
    return r.id;
  }
  return (await one('INSERT INTO categories (name, slug, kind, description, sort_order, active) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', vals)).id;
}

router.post('/categories', async (req, res) => {
  res.status(201).json({ id: await saveCategory(parse(categorySchema, req.body)) });
});
router.put('/categories/:id', async (req, res) => {
  res.json({ id: await saveCategory(parse(categorySchema, req.body), Number(req.params.id)) });
});
router.delete('/categories/:id', async (req, res) => {
  const used = await one('SELECT count(*)::int AS n FROM product_categories WHERE category_id = $1', [Number(req.params.id)]);
  if (used.n > 0) throw new HttpError(409, `Esta categoria tem ${used.n} produto(s). Mova os produtos ou desative a categoria.`);
  const r = await query('DELETE FROM categories WHERE id = $1', [Number(req.params.id)]);
  if (r.rowCount === 0) throw notFound('Categoria não encontrada.');
  res.json({ ok: true });
});

// ---------- Cupons ----------
const couponSchema = z
  .object({
    code: z.string().trim().toUpperCase().min(3, 'Mínimo de 3 caracteres').max(30).regex(/^[A-Z0-9_-]+$/, 'Use letras, números, - ou _'),
    description: z.string().trim().max(200).optional().default(''),
    discountType: z.enum(['percent', 'fixed']),
    value: z.coerce.number().positive('Informe o desconto'),
    minOrder: z.coerce.number().min(0).default(0),
    maxUses: z.coerce.number().int().positive().optional().nullable(),
    startsAt: z.string().optional().nullable(),
    endsAt: z.string().optional().nullable(),
    active: z.boolean().default(true),
  })
  .refine((d) => d.discountType !== 'percent' || d.value <= 100, { path: ['value'], message: 'Percentual até 100' });

const serializeCoupon = (c) => ({
  id: c.id, code: c.code, description: c.description, discountType: c.discount_type,
  value: c.discount_type === 'percent' ? c.value : c.value / 100, minOrder: c.min_order_cents / 100,
  maxUses: c.max_uses, usedCount: c.used_count, startsAt: c.starts_at, endsAt: c.ends_at, active: c.active,
});

router.get('/coupons', async (_req, res) => {
  res.json({ items: (await many('SELECT * FROM coupons ORDER BY created_at DESC')).map(serializeCoupon) });
});

async function saveCoupon(d, id) {
  const vals = [d.code, d.description, d.discountType, d.discountType === 'percent' ? Math.round(d.value) : Math.round(d.value * 100),
    Math.round(d.minOrder * 100), d.maxUses || null, d.startsAt || null, d.endsAt || null, d.active];
  if (id) {
    const r = await one(`UPDATE coupons SET code=$1, description=$2, discount_type=$3, value=$4, min_order_cents=$5, max_uses=$6, starts_at=$7, ends_at=$8, active=$9 WHERE id=$10 RETURNING *`, [...vals, id]);
    if (!r) throw notFound('Cupom não encontrado.');
    return r;
  }
  return one(`INSERT INTO coupons (code, description, discount_type, value, min_order_cents, max_uses, starts_at, ends_at, active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, vals);
}

router.post('/coupons', async (req, res) => {
  res.status(201).json({ coupon: serializeCoupon(await saveCoupon(parse(couponSchema, req.body))) });
});
router.put('/coupons/:id', async (req, res) => {
  res.json({ coupon: serializeCoupon(await saveCoupon(parse(couponSchema, req.body), Number(req.params.id))) });
});
router.delete('/coupons/:id', async (req, res) => {
  const r = await query('DELETE FROM coupons WHERE id = $1', [Number(req.params.id)]);
  if (r.rowCount === 0) throw notFound('Cupom não encontrado.');
  res.json({ ok: true });
});

// ---------- Promoções ----------
router.get('/promotions', async (_req, res) => {
  const rows = await many(`SELECT id, name, brand, price_cents, sale_price_cents, sale_ends_at, on_sale, image_url FROM v_products WHERE sale_price_cents IS NOT NULL ORDER BY on_sale DESC, sale_ends_at NULLS LAST, name`);
  res.json({
    items: rows.map((p) => ({ id: p.id, name: p.name, brand: p.brand, image: p.image_url, priceCents: p.price_cents, salePriceCents: p.sale_price_cents, endsAt: p.sale_ends_at, active: p.on_sale, percent: Math.round((1 - p.sale_price_cents / p.price_cents) * 100) })),
  });
});

router.post('/promotions/apply', async (req, res) => {
  const d = parse(
    z.object({
      percent: z.coerce.number().int().min(1, 'Mínimo 1%').max(90, 'Máximo 90%'),
      productIds: z.array(z.coerce.number().int()).optional().default([]),
      categoryId: z.coerce.number().int().optional().nullable(),
      endsAt: z.string().optional().nullable(),
    }).refine((x) => x.productIds.length || x.categoryId, { path: ['productIds'], message: 'Escolha produtos ou uma categoria' }),
    req.body,
  );
  const ids = d.categoryId ? (await many('SELECT product_id FROM product_categories WHERE category_id = $1', [d.categoryId])).map((r) => r.product_id) : d.productIds;
  const r = await query(
    `UPDATE products SET sale_price_cents = GREATEST(1, ROUND(price_cents * (100 - $1) / 100.0))::int, sale_ends_at = $2, updated_at = now()
      WHERE id = ANY($3::int[]) AND ROUND(price_cents * (100 - $1) / 100.0) < price_cents`,
    [d.percent, d.endsAt || null, ids.length ? ids : [0]],
  );
  res.json({ updated: r.rowCount });
});

router.post('/promotions/remove', async (req, res) => {
  const { productIds } = parse(z.object({ productIds: z.array(z.coerce.number().int()).min(1) }), req.body);
  const r = await query('UPDATE products SET sale_price_cents = NULL, sale_ends_at = NULL, updated_at = now() WHERE id = ANY($1::int[])', [productIds]);
  res.json({ updated: r.rowCount });
});

// ---------- Configurações da loja ----------
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor em hexadecimal, ex.: #1F2A5C');
const settingsSchema = z.object({
  store: z.object({
    name: z.string().trim().min(2, 'Informe o nome da loja').max(40),
    tagline: z.string().trim().max(120).default(''),
    logoUrl: z.string().trim().max(500).default(''),
    colors: z.object({ primary: hex, accent: hex, sale: hex }),
    contact: z.object({
      email: z.string().trim().email('E-mail inválido').or(z.literal('')),
      phone: z.string().trim().max(30).default(''),
      whatsapp: z.string().trim().max(30).default(''),
      address: z.string().trim().max(200).default(''),
      hours: z.string().trim().max(100).default(''),
    }),
    social: z.object({
      instagram: z.string().trim().max(200).default(''),
      facebook: z.string().trim().max(200).default(''),
      tiktok: z.string().trim().max(200).default(''),
      youtube: z.string().trim().max(200).default(''),
    }),
    legalName: z.string().trim().max(120).default(''),
    cnpj: z.string().trim().max(20).default(''),
  }),
  banners: z.array(z.object({
    id: z.string().max(20),
    title: z.string().trim().min(2, 'Título do banner').max(80),
    subtitle: z.string().trim().max(160).default(''),
    ctaLabel: z.string().trim().max(30).default('Ver mais'),
    ctaUrl: z.string().trim().max(200).regex(/^\//, 'Use um endereço interno, ex.: /categoria/promocoes'),
    imageUrl: z.string().trim().max(500).default(''),
    motif: z.enum(['jacket', 'pants', 'tshirt', 'shorts', 'sneaker', 'cap', 'bag']).default('jacket'),
  })).max(6),
  shipping: z.object({
    freeShippingMin: z.coerce.number().min(0),
    economyBase: z.coerce.number().min(0),
    expressBase: z.coerce.number().min(0),
    perKg: z.coerce.number().min(0),
  }),
});

router.get('/settings', async (_req, res) => {
  const s = await getSettings();
  res.json({
    store: s.store,
    banners: s.banners,
    shipping: {
      freeShippingMin: s.shipping.freeShippingMinCents / 100,
      economyBase: s.shipping.economyBaseCents / 100,
      expressBase: s.shipping.expressBaseCents / 100,
      perKg: s.shipping.perKgCents / 100,
    },
    defaults: DEFAULT_SETTINGS.store.colors,
  });
});

router.put('/settings', async (req, res) => {
  const d = parse(settingsSchema, req.body);
  await saveSetting('store', d.store);
  await saveSetting('banners', d.banners);
  await saveSetting('shipping', {
    freeShippingMinCents: Math.round(d.shipping.freeShippingMin * 100),
    economyBaseCents: Math.round(d.shipping.economyBase * 100),
    expressBaseCents: Math.round(d.shipping.expressBase * 100),
    perKgCents: Math.round(d.shipping.perKg * 100),
  });
  res.json({ ok: true });
});

router.get('/newsletter', async (_req, res) => {
  const rows = await many('SELECT email, created_at FROM newsletter_subscribers ORDER BY created_at DESC LIMIT 500');
  res.json({ items: rows.map((r) => ({ email: r.email, createdAt: r.created_at })) });
});

export default router;
