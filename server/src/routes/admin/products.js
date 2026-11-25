import express from 'express';
import { z } from 'zod';
import { many, one, query, transaction } from '../../db/pool.js';
import { HttpError, notFound, parse, slugify, toInt } from '../../lib/http.js';
import { sortSizes } from '../../services/catalog.js';

const router = express.Router();

const money = z.coerce.number({ invalid_type_error: 'Valor inválido' }).nonnegative('Valor inválido');

const productSchema = z
  .object({
    name: z.string().trim().min(3, 'Informe o nome').max(140),
    slug: z.string().trim().max(80).optional().default(''),
    description: z.string().trim().min(10, 'Escreva uma descrição (mín. 10 caracteres)').max(5000),
    brand: z.string().trim().min(2, 'Informe a marca').max(60),
    price: money.refine((v) => v > 0, 'Informe o preço'),
    salePrice: money.optional().nullable(),
    saleEndsAt: z.string().optional().nullable(),
    featured: z.boolean().default(false),
    active: z.boolean().default(true),
    weightGrams: z.coerce.number().int().min(1, 'Peso inválido').max(30000).default(300),
    categoryIds: z.array(z.coerce.number().int()).min(1, 'Escolha pelo menos uma categoria'),
    images: z.array(z.object({ url: z.string().min(1).max(500), alt: z.string().max(200).optional().default('') })).max(10).default([]),
    variants: z
      .array(
        z.object({
          id: z.coerce.number().int().optional().nullable(),
          size: z.string().trim().min(1, 'Tamanho').max(10),
          color: z.string().trim().min(1, 'Cor').max(40),
          colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor em hexadecimal'),
          sku: z.string().trim().max(60).optional().default(''),
          stock: z.coerce.number().int().min(0, 'Estoque não pode ser negativo').max(100000),
        }),
      )
      .min(1, 'Cadastre pelo menos uma variação (tamanho e cor)'),
  })
  .refine((d) => !d.salePrice || d.salePrice < d.price, { path: ['salePrice'], message: 'O preço promocional deve ser menor que o preço' });

async function productPayload(id) {
  const p = await one('SELECT * FROM v_products WHERE id = $1', [id]);
  if (!p) throw notFound('Produto não encontrado.');
  const [images, variants, cats] = await Promise.all([
    many('SELECT url, alt FROM product_images WHERE product_id = $1 ORDER BY sort_order, id', [id]),
    many('SELECT id, size, color_name, color_hex, sku, stock FROM product_variants WHERE product_id = $1 ORDER BY id', [id]),
    many('SELECT category_id FROM product_categories WHERE product_id = $1', [id]),
  ]);
  return {
    id: p.id, name: p.name, slug: p.slug, description: p.description, brand: p.brand,
    price: p.price_cents / 100, salePrice: p.sale_price_cents ? p.sale_price_cents / 100 : null, saleEndsAt: p.sale_ends_at,
    featured: p.featured, active: p.active, weightGrams: p.weight_grams, soldCount: p.sold_count, onSale: p.on_sale,
    categoryIds: cats.map((c) => c.category_id),
    images,
    variants: variants.map((v) => ({ id: v.id, size: v.size, color: v.color_name, colorHex: v.color_hex, sku: v.sku, stock: v.stock })),
  };
}

router.get('/products', async (req, res) => {
  const params = [];
  const where = ['true'];
  if (req.query.q) {
    params.push(`%${String(req.query.q).trim()}%`);
    where.push(`(p.name ILIKE $${params.length} OR p.brand ILIKE $${params.length} OR EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.sku ILIKE $${params.length}))`);
  }
  if (req.query.status === 'ativos') where.push('p.active');
  if (req.query.status === 'inativos') where.push('NOT p.active');
  if (req.query.status === 'sem_estoque') where.push('p.total_stock = 0');
  if (req.query.categoria) {
    params.push(Number(req.query.categoria));
    where.push(`EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = p.id AND pc.category_id = $${params.length})`);
  }
  const page = Math.max(1, toInt(req.query.pagina, 1));
  const limit = 20;
  const [rows, count] = await Promise.all([
    many(
      `SELECT p.id, p.name, p.slug, p.brand, p.price_cents, p.effective_price_cents, p.on_sale, p.active, p.featured,
              p.total_stock, p.image_url, p.sold_count, p.created_at,
              (SELECT string_agg(c.name, ', ' ORDER BY c.kind, c.sort_order) FROM product_categories pc JOIN categories c ON c.id = pc.category_id WHERE pc.product_id = p.id) AS categories
         FROM v_products p WHERE ${where.join(' AND ')} ORDER BY p.created_at DESC, p.id DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
      params,
    ),
    one(`SELECT count(*)::int AS n FROM v_products p WHERE ${where.join(' AND ')}`, params),
  ]);
  res.json({
    items: rows.map((p) => ({
      id: p.id, name: p.name, slug: p.slug, brand: p.brand, priceCents: p.price_cents, finalPriceCents: p.effective_price_cents,
      onSale: p.on_sale, active: p.active, featured: p.featured, totalStock: p.total_stock, image: p.image_url,
      soldCount: p.sold_count, categories: p.categories, createdAt: p.created_at,
    })),
    total: count.n,
    page,
    pages: Math.max(1, Math.ceil(count.n / limit)),
  });
});

router.get('/products/:id', async (req, res) => {
  res.json({ product: await productPayload(Number(req.params.id)) });
});

async function uniqueSlug(db, base, excludeId) {
  const root = slugify(base) || 'produto';
  let slug = root;
  for (let i = 2; await one('SELECT 1 FROM products WHERE slug = $1 AND id <> $2', [slug, excludeId || 0], db); i++) slug = `${root}-${i}`;
  return slug;
}

async function saveProduct(data, id) {
  return transaction(async (db) => {
    const slug = await uniqueSlug(db, data.slug || data.name, id);
    const vals = [
      data.name, slug, data.description, data.brand, Math.round(data.price * 100),
      data.salePrice ? Math.round(data.salePrice * 100) : null, data.salePrice && data.saleEndsAt ? data.saleEndsAt : null,
      data.featured, data.active, data.weightGrams,
    ];
    let productId = id;
    if (id) {
      const r = await db.query(
        `UPDATE products SET name=$1, slug=$2, description=$3, brand=$4, price_cents=$5, sale_price_cents=$6, sale_ends_at=$7,
                featured=$8, active=$9, weight_grams=$10, updated_at=now() WHERE id=$11`,
        [...vals, id],
      );
      if (r.rowCount === 0) throw notFound('Produto não encontrado.');
    } else {
      productId = (
        await one(
          `INSERT INTO products (name, slug, description, brand, price_cents, sale_price_cents, sale_ends_at, featured, active, weight_grams)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
          vals,
          db,
        )
      ).id;
    }

    await db.query('DELETE FROM product_categories WHERE product_id = $1', [productId]);
    for (const cid of new Set(data.categoryIds)) {
      await db.query('INSERT INTO product_categories (product_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [productId, cid]);
    }
    await db.query('DELETE FROM product_images WHERE product_id = $1', [productId]);
    for (const [i, img] of data.images.entries()) {
      await db.query('INSERT INTO product_images (product_id, url, alt, sort_order) VALUES ($1, $2, $3, $4)', [productId, img.url, img.alt || data.name, i]);
    }

    // variantes: atualiza as existentes, cria as novas e remove as que saíram
    const seen = new Set();
    for (const v of data.variants) {
      const key = `${v.size}|${v.color}`.toLowerCase();
      if (seen.has(key)) throw new HttpError(422, `A variação ${v.size} / ${v.color} está repetida.`);
      seen.add(key);
    }
    const existing = await many('SELECT id FROM product_variants WHERE product_id = $1', [productId], db);
    const keepIds = data.variants.filter((v) => v.id).map((v) => Number(v.id));
    for (const e of existing) {
      if (!keepIds.includes(e.id)) await db.query('DELETE FROM product_variants WHERE id = $1', [e.id]);
    }
    for (const v of data.variants) {
      const sku = v.sku || `P${productId}-${slugify(v.color).slice(0, 10)}-${slugify(v.size)}`.toUpperCase();
      if (v.id && existing.some((e) => e.id === Number(v.id))) {
        await db.query('UPDATE product_variants SET size=$1, color_name=$2, color_hex=$3, sku=$4, stock=$5 WHERE id=$6 AND product_id=$7', [
          v.size, v.color, v.colorHex, sku, v.stock, v.id, productId,
        ]);
      } else {
        await db.query('INSERT INTO product_variants (product_id, size, color_name, color_hex, sku, stock) VALUES ($1,$2,$3,$4,$5,$6)', [
          productId, v.size, v.color, v.colorHex, sku, v.stock,
        ]);
      }
    }
    return productId;
  });
}

router.post('/products', async (req, res) => {
  const id = await saveProduct(parse(productSchema, req.body));
  res.status(201).json({ product: await productPayload(id) });
});

router.put('/products/:id', async (req, res) => {
  const id = await saveProduct(parse(productSchema, req.body), Number(req.params.id));
  res.json({ product: await productPayload(id) });
});

router.delete('/products/:id', async (req, res) => {
  const r = await query('DELETE FROM products WHERE id = $1', [Number(req.params.id)]);
  if (r.rowCount === 0) throw notFound('Produto não encontrado.');
  res.json({ ok: true });
});

// ---------- Upload de imagens (JSON base64, sem dependências) ----------
const SIGNATURES = [
  { mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/webp', test: (b) => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
];

router.post('/uploads', express.json({ limit: '4.5mb' }), async (req, res) => {
  const { data } = parse(z.object({ data: z.string().min(20) }), req.body);
  const b64 = data.includes(',') ? data.split(',')[1] : data;
  const buf = Buffer.from(b64, 'base64');
  if (buf.length > 3 * 1024 * 1024) throw new HttpError(413, 'A imagem deve ter no máximo 3 MB.');
  const sig = SIGNATURES.find((s) => s.test(buf));
  if (!sig) throw new HttpError(422, 'Envie uma imagem JPG, PNG ou WEBP.');
  const row = await one('INSERT INTO media (mime, data, size) VALUES ($1, $2, $3) RETURNING id', [sig.mime, buf, buf.length]);
  res.status(201).json({ url: `/api/media/${row.id}` });
});

// ---------- Estoque ----------
router.get('/stock', async (req, res) => {
  const params = [];
  const where = ['true'];
  if (req.query.q) {
    params.push(`%${String(req.query.q).trim()}%`);
    where.push(`(p.name ILIKE $1 OR v.sku ILIKE $1)`);
  }
  const low = toInt(req.query.ate, null);
  if (low !== null) {
    params.push(low);
    where.push(`v.stock <= $${params.length}`);
  }
  const rows = await many(
    `SELECT v.id, v.size, v.color_name, v.color_hex, v.sku, v.stock, p.id AS product_id, p.name, p.active
       FROM product_variants v JOIN products p ON p.id = v.product_id
      WHERE ${where.join(' AND ')} ORDER BY v.stock ASC, p.name, v.id LIMIT 300`,
    params,
  );
  res.json({
    items: rows.map((r) => ({ id: r.id, productId: r.product_id, product: r.name, active: r.active, size: r.size, color: r.color_name, colorHex: r.color_hex, sku: r.sku, stock: r.stock })),
  });
});

router.patch('/stock/:variantId', async (req, res) => {
  const data = parse(
    z.union([
      z.object({ stock: z.coerce.number().int().min(0, 'Estoque não pode ser negativo').max(100000) }),
      z.object({ delta: z.coerce.number().int().min(-100000).max(100000) }),
    ]),
    req.body,
  );
  const row =
    'stock' in data
      ? await one('UPDATE product_variants SET stock = $1 WHERE id = $2 RETURNING id, stock', [data.stock, Number(req.params.variantId)])
      : await one('UPDATE product_variants SET stock = stock + $1 WHERE id = $2 AND stock + $1 >= 0 RETURNING id, stock', [data.delta, Number(req.params.variantId)]);
  if (!row) throw new HttpError(422, 'Não foi possível ajustar: o estoque ficaria negativo ou a variação não existe.');
  res.json({ variant: row });
});

router.get('/meta', async (_req, res) => {
  const [brands, sizes, colors] = await Promise.all([
    many('SELECT DISTINCT brand FROM products ORDER BY brand'),
    many('SELECT DISTINCT size FROM product_variants'),
    many('SELECT DISTINCT ON (color_name) color_name, color_hex FROM product_variants ORDER BY color_name'),
  ]);
  res.json({
    brands: brands.map((b) => b.brand),
    sizes: sortSizes(sizes.map((s) => s.size)),
    colors: colors.map((c) => ({ name: c.color_name, hex: c.color_hex })),
  });
});

export default router;
