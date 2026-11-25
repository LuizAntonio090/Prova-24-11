import express from 'express';
import { z } from 'zod';
import { many, one, query } from '../db/pool.js';
import { conflict, listParam, notFound, parse, toInt } from '../lib/http.js';
import { getSettings } from '../lib/settings.js';
import { CARD_COLUMNS, cardsWhere, serializeCard, sortSizes } from '../services/catalog.js';

const router = express.Router();

/** Categorias virtuais: não existem na tabela, são filtros especiais. */
const VIRTUAL = {
  promocoes: { name: 'Promoções', slug: 'promocoes', kind: 'virtual', description: 'Peças com preço reduzido por tempo limitado.' },
  lancamentos: { name: 'Lançamentos', slug: 'lancamentos', kind: 'virtual', description: 'As peças que acabaram de chegar.' },
  'mais-vendidos': { name: 'Mais vendidos', slug: 'mais-vendidos', kind: 'virtual', description: 'O que os clientes mais estão levando.' },
};

const SORTS = {
  relevancia: 'p.featured DESC, p.sold_count DESC, p.created_at DESC',
  menor_preco: 'p.effective_price_cents ASC, p.id',
  maior_preco: 'p.effective_price_cents DESC, p.id',
  lancamentos: 'p.created_at DESC, p.id DESC',
  mais_vendidos: 'p.sold_count DESC, p.created_at DESC',
};

router.get('/settings', async (_req, res) => {
  const s = await getSettings();
  res.json({
    store: s.store,
    banners: s.banners,
    shipping: { freeShippingMinCents: s.shipping.freeShippingMinCents },
  });
});

router.get('/categories', async (_req, res) => {
  const rows = await many(
    `SELECT c.id, c.name, c.slug, c.kind, c.description,
            (SELECT count(*) FROM product_categories pc JOIN products p ON p.id = pc.product_id
              WHERE pc.category_id = c.id AND p.active)::int AS product_count
       FROM categories c WHERE c.active ORDER BY c.kind, c.sort_order, c.name`,
  );
  res.json({ categories: rows.map((c) => ({ id: c.id, name: c.name, slug: c.slug, kind: c.kind, description: c.description, productCount: c.product_count })) });
});

router.get('/home', async (_req, res) => {
  const [featured, newest, bestSellers, onSale, categories] = await Promise.all([
    cardsWhere('p.featured', [], 'p.created_at DESC', 8),
    cardsWhere('true', [], 'p.created_at DESC', 8),
    cardsWhere('true', [], 'p.sold_count DESC, p.featured DESC, p.id', 8),
    cardsWhere('p.on_sale', [], 'p.sale_ends_at ASC NULLS LAST, p.id', 8),
    many(
      `SELECT c.name, c.slug, c.kind,
              (SELECT vp.image_url FROM product_categories pc JOIN v_products vp ON vp.id = pc.product_id
                WHERE pc.category_id = c.id AND vp.active AND vp.image_url IS NOT NULL ORDER BY vp.featured DESC, vp.id LIMIT 1) AS image
         FROM categories c WHERE c.active ORDER BY c.kind, c.sort_order`,
    ),
  ]);
  const { banners } = await getSettings();
  res.json({ banners, featured, newest, bestSellers, onSale, categories });
});

/** Listagem com filtros, ordenação, paginação e facetas. */
router.get('/products', async (req, res) => {
  const q = req.query;
  const params = [];
  const p = (v) => {
    params.push(v);
    return `$${params.length}`;
  };
  const base = ['p.active'];
  let category = null;

  if (q.categoria) {
    const slug = String(q.categoria);
    if (VIRTUAL[slug]) {
      category = VIRTUAL[slug];
      if (slug === 'promocoes') base.push('p.on_sale');
      if (slug === 'lancamentos') base.push(`p.created_at > now() - interval '60 days'`);
    } else {
      const c = await one('SELECT id, name, slug, kind, description FROM categories WHERE slug = $1 AND active', [slug]);
      if (!c) throw notFound('Categoria não encontrada.');
      category = c;
      base.push(`EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = p.id AND pc.category_id = ${p(c.id)})`);
    }
  }
  const search = String(q.q || '').trim().slice(0, 80);
  if (search) {
    const terms = search.split(/\s+/).slice(0, 5);
    for (const t of terms) {
      const ph = p(`%${t.replace(/[%_\\]/g, (m) => '\\' + m)}%`);
      base.push(`(p.name ILIKE ${ph} OR p.brand ILIKE ${ph} OR p.description ILIKE ${ph}
        OR EXISTS (SELECT 1 FROM product_categories pc JOIN categories c ON c.id = pc.category_id WHERE pc.product_id = p.id AND c.name ILIKE ${ph}))`);
    }
  }

  const filters = [];
  const cats = listParam(q.cats);
  if (cats.length) {
    filters.push(`EXISTS (SELECT 1 FROM product_categories pc JOIN categories c ON c.id = pc.category_id
      WHERE pc.product_id = p.id AND c.slug = ANY(${p(cats)}::text[]))`);
  }
  const sizes = listParam(q.tamanhos);
  const colors = listParam(q.cores);
  const inStockOnly = q.disponibilidade === 'em_estoque';
  if (sizes.length || colors.length) {
    const conds = ['v.product_id = p.id'];
    if (sizes.length) conds.push(`v.size = ANY(${p(sizes)}::text[])`);
    if (colors.length) conds.push(`v.color_name = ANY(${p(colors)}::text[])`);
    if (inStockOnly) conds.push('v.stock > 0');
    filters.push(`EXISTS (SELECT 1 FROM product_variants v WHERE ${conds.join(' AND ')})`);
  }
  if (inStockOnly) filters.push('p.total_stock > 0');
  const brands = listParam(q.marcas);
  if (brands.length) filters.push(`p.brand = ANY(${p(brands)}::text[])`);
  const minPrice = Number(q.preco_min);
  const maxPrice = Number(q.preco_max);
  if (Number.isFinite(minPrice) && minPrice > 0) filters.push(`p.effective_price_cents >= ${p(Math.round(minPrice * 100))}`);
  if (Number.isFinite(maxPrice) && maxPrice > 0) filters.push(`p.effective_price_cents <= ${p(Math.round(maxPrice * 100))}`);

  const baseWhere = base.join(' AND ');
  const where = [...base, ...filters].join(' AND ');
  const sortKey = SORTS[q.ordem] ? q.ordem : category?.slug === 'mais-vendidos' ? 'mais_vendidos' : category?.slug === 'lancamentos' ? 'lancamentos' : 'relevancia';
  const limit = Math.min(48, Math.max(1, toInt(q.limite, 24)));
  const page = Math.max(1, toInt(q.pagina, 1));

  const baseParamCount = params.length - (cats.length ? 1 : 0) - (sizes.length ? 1 : 0) - (colors.length ? 1 : 0) - (brands.length ? 1 : 0)
    - (Number.isFinite(minPrice) && minPrice > 0 ? 1 : 0) - (Number.isFinite(maxPrice) && maxPrice > 0 ? 1 : 0);
  const baseParams = params.slice(0, baseParamCount);

  const [items, count, facetVariants, facetBrands, facetCats, priceRange] = await Promise.all([
    many(`SELECT ${CARD_COLUMNS} FROM v_products p WHERE ${where} ORDER BY ${SORTS[sortKey]} LIMIT ${limit} OFFSET ${(page - 1) * limit}`, params),
    one(`SELECT count(*)::int AS n FROM v_products p WHERE ${where}`, params),
    many(`SELECT DISTINCT v.size, v.color_name, v.color_hex FROM product_variants v JOIN v_products p ON p.id = v.product_id WHERE ${baseWhere}`, baseParams),
    many(`SELECT p.brand, count(*)::int AS n FROM v_products p WHERE ${baseWhere} GROUP BY p.brand ORDER BY p.brand`, baseParams),
    many(
      `SELECT c.slug, c.name, c.kind, count(*)::int AS n FROM v_products p
         JOIN product_categories pc ON pc.product_id = p.id JOIN categories c ON c.id = pc.category_id
        WHERE ${baseWhere} AND c.active GROUP BY c.slug, c.name, c.kind, c.sort_order ORDER BY c.kind, c.sort_order`,
      baseParams,
    ),
    one(`SELECT min(p.effective_price_cents)::int AS min, max(p.effective_price_cents)::int AS max FROM v_products p WHERE ${baseWhere}`, baseParams),
  ]);

  const colorMap = new Map();
  for (const v of facetVariants) colorMap.set(v.color_name, v.color_hex);
  res.json({
    category,
    search,
    sort: sortKey,
    items: items.map(serializeCard),
    total: count.n,
    page,
    pages: Math.max(1, Math.ceil(count.n / limit)),
    facets: {
      sizes: sortSizes([...new Set(facetVariants.map((v) => v.size))]),
      colors: [...colorMap].map(([name, hex]) => ({ name, hex })).sort((a, b) => a.name.localeCompare(b.name)),
      brands: facetBrands.map((b) => ({ name: b.brand, count: b.n })),
      categories: facetCats.filter((c) => c.slug !== category?.slug).map((c) => ({ slug: c.slug, name: c.name, kind: c.kind, count: c.n })),
      price: { minCents: priceRange?.min || 0, maxCents: priceRange?.max || 0 },
    },
  });
});

router.get('/products/:slug', async (req, res) => {
  const p = await one('SELECT * FROM v_products WHERE slug = $1 AND active', [req.params.slug]);
  if (!p) throw notFound('Produto não encontrado.');
  const [images, variants, categories] = await Promise.all([
    many('SELECT id, url, alt FROM product_images WHERE product_id = $1 ORDER BY sort_order, id', [p.id]),
    many('SELECT id, size, color_name, color_hex, stock, sku FROM product_variants WHERE product_id = $1 ORDER BY id', [p.id]),
    many(`SELECT c.id, c.name, c.slug, c.kind FROM categories c JOIN product_categories pc ON pc.category_id = c.id WHERE pc.product_id = $1 ORDER BY c.kind, c.sort_order`, [p.id]),
  ]);
  const catIds = categories.map((c) => c.id);
  const related = await cardsWhere(
    `p.id <> $1 AND EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = p.id AND pc.category_id = ANY($2::int[]))`,
    [p.id, catIds.length ? catIds : [0]],
    `(SELECT count(*) FROM product_categories pc WHERE pc.product_id = p.id AND pc.category_id = ANY($2::int[])) DESC, p.sold_count DESC, p.id`,
    8,
  );
  const { shipping } = await getSettings();
  const card = serializeCard({ ...p, colors: [] });
  res.json({
    product: {
      ...card,
      description: p.description,
      weightGrams: p.weight_grams,
      saleEndsAt: p.on_sale ? p.sale_ends_at : null,
      totalStock: p.total_stock,
      images: images.map((i) => ({ id: i.id, url: i.url, alt: i.alt || p.name })),
      variants: variants.map((v) => ({ id: v.id, size: v.size, color: v.color_name, colorHex: v.color_hex, stock: v.stock, sku: v.sku })),
      sizes: sortSizes([...new Set(variants.map((v) => v.size))]),
      colors: [...new Map(variants.map((v) => [v.color_name, { name: v.color_name, hex: v.color_hex }])).values()],
      categories: categories.map((c) => ({ name: c.name, slug: c.slug, kind: c.kind })),
    },
    related,
    shipping: { freeShippingMinCents: shipping.freeShippingMinCents },
  });
});

/** Entrega imagens guardadas no banco (cache longo: o conteúdo de um id nunca muda). */
router.get('/media/:id', async (req, res) => {
  const id = Number(req.params.id);
  const m = Number.isInteger(id) ? await one('SELECT mime, data FROM media WHERE id = $1', [id]) : null;
  if (!m) throw notFound('Imagem não encontrada.');
  const buf = Buffer.isBuffer(m.data) ? m.data : Buffer.from(String(m.data).slice(2), 'hex');
  res.set({
    'Content-Type': m.mime,
    'Content-Length': String(buf.length),
    'Cache-Control': 'public, max-age=31536000, immutable',
    // impede que um SVG execute scripts se for aberto diretamente
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
  });
  res.send(buf);
});

router.post('/newsletter', async (req, res) => {
  const { email } = parse(z.object({ email: z.string().trim().toLowerCase().email('Informe um e-mail válido') }), req.body);
  const r = await query('INSERT INTO newsletter_subscribers (email) VALUES ($1) ON CONFLICT (email) DO NOTHING', [email]);
  if (r.rowCount === 0) throw conflict('Este e-mail já recebe nossas novidades.');
  res.status(201).json({ ok: true });
});

export default router;
