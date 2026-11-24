import { many, query } from '../db/pool.js';

export const DEFAULT_SETTINGS = {
  store: {
    name: 'Trama',
    tagline: 'Roupas bem-feitas para o dia a dia',
    logoUrl: '',
    colors: { primary: '#1F2A5C', accent: '#D9A441', sale: '#B3261E' },
    contact: {
      email: 'contato@trama.com.br',
      phone: '(11) 4000-1234',
      whatsapp: '',
      address: 'Rua Augusta, 1500 — Consolação, São Paulo/SP',
      hours: 'Segunda a sexta, das 9h às 18h',
    },
    social: { instagram: '', facebook: '', tiktok: '', youtube: '' },
    legalName: '',
    cnpj: '',
  },
  banners: [
    {
      id: 'b1',
      title: 'Nova coleção de verão',
      subtitle: 'Linho, algodão e cores leves para os dias quentes.',
      ctaLabel: 'Ver lançamentos',
      ctaUrl: '/categoria/lancamentos',
      imageUrl: '',
      motif: 'jacket',
    },
    {
      id: 'b2',
      title: 'Jeans com até 30% off',
      subtitle: 'Calças e jaquetas de denim com preço de liquidação.',
      ctaLabel: 'Ver promoções',
      ctaUrl: '/categoria/promocoes',
      imageUrl: '',
      motif: 'pants',
    },
    {
      id: 'b3',
      title: 'Infantil para brincar',
      subtitle: 'Peças macias e resistentes, do 2 ao 14.',
      ctaLabel: 'Ver infantil',
      ctaUrl: '/categoria/infantil',
      imageUrl: '',
      motif: 'tshirt',
    },
  ],
  shipping: {
    freeShippingMinCents: 29900,
    economyBaseCents: 1990,
    expressBaseCents: 3490,
    perKgCents: 600,
  },
};

let cache = null;
let cacheAt = 0;

export async function getSettings() {
  if (cache && Date.now() - cacheAt < 10_000) return cache;
  const rows = await many('SELECT key, value FROM settings');
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  cache = {
    store: deepMerge(DEFAULT_SETTINGS.store, stored.store || {}),
    banners: stored.banners || DEFAULT_SETTINGS.banners,
    shipping: { ...DEFAULT_SETTINGS.shipping, ...(stored.shipping || {}) },
  };
  cacheAt = Date.now();
  return cache;
}

export async function saveSetting(key, value) {
  await query(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
  cache = null;
}

function deepMerge(base, extra) {
  const out = { ...base };
  for (const [k, v] of Object.entries(extra)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? deepMerge(base[k] || {}, v) : v;
  }
  return out;
}
