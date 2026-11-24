import { one } from '../db/pool.js';
import { getSettings } from '../lib/settings.js';
import { quoteShipping } from '../lib/shipping.js';

const MAX_QTY_PER_ITEM = 10;

/** Valida um cupom para um subtotal. Retorna { coupon, discountCents } ou { error }. */
export async function evaluateCoupon(code, subtotalCents, db) {
  const coupon = await one('SELECT * FROM coupons WHERE upper(code) = upper($1)', [code.trim()], db);
  const now = Date.now();
  if (!coupon || !coupon.active) return { error: 'Cupom inválido.' };
  if (coupon.starts_at && new Date(coupon.starts_at).getTime() > now) return { error: 'Este cupom ainda não está valendo.' };
  if (coupon.ends_at && new Date(coupon.ends_at).getTime() < now) return { error: 'Este cupom expirou.' };
  if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) return { error: 'Este cupom atingiu o limite de usos.' };
  if (subtotalCents < coupon.min_order_cents) {
    const min = (coupon.min_order_cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    return { error: `Este cupom vale para compras a partir de ${min}.` };
  }
  const discountCents =
    coupon.discount_type === 'percent'
      ? Math.round((subtotalCents * Math.min(coupon.value, 100)) / 100)
      : Math.min(coupon.value, subtotalCents);
  return { coupon, discountCents };
}

/**
 * Monta o orçamento do carrinho a partir do banco — preços, estoque, cupom
 * e frete nunca são confiados ao navegador.
 * Com `lock: true` (dentro de transação), trava as variantes para o pedido.
 */
export async function buildQuote(db, { items = [], couponCode, cep, shippingMethod, lock = false }) {
  const merged = new Map();
  for (const it of items) {
    const id = Number(it.variantId);
    const qty = Math.max(1, Math.min(MAX_QTY_PER_ITEM, Number(it.quantity) || 1));
    if (Number.isInteger(id)) merged.set(id, Math.min(MAX_QTY_PER_ITEM, (merged.get(id) || 0) + qty));
  }
  const ids = [...merged.keys()];

  const rows = ids.length
    ? (
        await db.query(
          `SELECT v.id AS variant_id, v.size, v.color_name, v.color_hex, v.stock,
                  p.id AS product_id, p.name, p.slug, p.active, p.weight_grams,
                  vp.effective_price_cents, vp.price_cents, vp.image_url
             FROM product_variants v
             JOIN products p ON p.id = v.product_id
             JOIN v_products vp ON vp.id = p.id
            WHERE v.id = ANY($1::int[])
            ORDER BY v.id
            ${lock ? 'FOR UPDATE OF v' : ''}`,
          [ids],
        )
      ).rows
    : [];
  const byId = new Map(rows.map((r) => [r.variant_id, r]));

  const lines = [];
  const issues = [];
  let subtotalCents = 0;
  let weight = 0;
  for (const [variantId, quantity] of merged) {
    const r = byId.get(variantId);
    if (!r || !r.active) {
      issues.push({ variantId, type: 'unavailable', message: 'Um produto do carrinho não está mais disponível.' });
      continue;
    }
    if (r.stock <= 0) {
      issues.push({ variantId, type: 'out_of_stock', message: `${r.name} (${r.size}, ${r.color_name}) esgotou.` });
      continue;
    }
    if (quantity > r.stock) {
      issues.push({
        variantId,
        type: 'insufficient_stock',
        available: r.stock,
        message: `${r.name} (${r.size}, ${r.color_name}) tem só ${r.stock} em estoque.`,
      });
    }
    const qty = Math.min(quantity, r.stock);
    const lineTotal = r.effective_price_cents * qty;
    subtotalCents += lineTotal;
    weight += r.weight_grams * qty;
    lines.push({
      variantId,
      productId: r.product_id,
      name: r.name,
      slug: r.slug,
      size: r.size,
      color: r.color_name,
      colorHex: r.color_hex,
      image: r.image_url,
      unitPriceCents: r.effective_price_cents,
      listPriceCents: r.price_cents,
      quantity: qty,
      requestedQuantity: quantity,
      stock: r.stock,
      lineTotalCents: lineTotal,
    });
  }

  let coupon = null;
  let couponError = null;
  let discountCents = 0;
  if (couponCode && couponCode.trim()) {
    const res = await evaluateCoupon(couponCode, subtotalCents, db);
    if (res.error) couponError = res.error;
    else {
      discountCents = res.discountCents;
      coupon = { id: res.coupon.id, code: res.coupon.code, description: res.coupon.description, discountCents };
    }
  }

  const settings = await getSettings();
  const shippingOptions = lines.length ? quoteShipping(cep, weight, subtotalCents - discountCents, settings.shipping) : [];
  const shipping = shippingOptions.find((o) => o.id === shippingMethod) || null;
  const totalCents = subtotalCents - discountCents + (shipping ? shipping.priceCents : 0);

  return {
    lines,
    issues,
    itemCount: lines.reduce((n, l) => n + l.quantity, 0),
    subtotalCents,
    discountCents,
    coupon,
    couponError,
    shippingOptions,
    shipping,
    totalCents,
    freeShippingMinCents: settings.shipping.freeShippingMinCents,
  };
}
