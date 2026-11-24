import { many } from '../db/pool.js';

const SIZE_ORDER = ['RN', 'PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG', '2', '4', '6', '8', '10', '12', '14', '16',
  '26', '27', '28', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '46', '48', 'Único'];

export function sortSizes(sizes) {
  return [...sizes].sort((a, b) => {
    const ia = SIZE_ORDER.indexOf(a);
    const ib = SIZE_ORDER.indexOf(b);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || String(a).localeCompare(String(b));
  });
}

const NEW_DAYS = 45;

/** Colunas usadas pelos cards de produto (sobre a visão v_products `p`). */
export const CARD_COLUMNS = `p.id, p.name, p.slug, p.brand, p.price_cents, p.effective_price_cents, p.on_sale,
  p.total_stock, p.image_url, p.image_url_2, p.created_at, p.featured, p.sold_count,
  (SELECT json_agg(DISTINCT jsonb_build_object('name', v.color_name, 'hex', v.color_hex))
     FROM product_variants v WHERE v.product_id = p.id) AS colors`;

export function serializeCard(p) {
  const onSale = Boolean(p.on_sale);
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    brand: p.brand,
    priceCents: p.price_cents,
    finalPriceCents: p.effective_price_cents,
    onSale,
    discountPercent: onSale ? Math.round((1 - p.effective_price_cents / p.price_cents) * 100) : 0,
    image: p.image_url,
    image2: p.image_url_2,
    inStock: p.total_stock > 0,
    isNew: Date.now() - new Date(p.created_at).getTime() < NEW_DAYS * 86400000,
    colors: (p.colors || []).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export async function cardsWhere(where, params, orderBy, limit) {
  const rows = await many(
    `SELECT ${CARD_COLUMNS} FROM v_products p WHERE p.active AND ${where} ORDER BY ${orderBy} LIMIT ${Number(limit)}`,
    params,
  );
  return rows.map(serializeCard);
}
