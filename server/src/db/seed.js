import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { slugify } from '../lib/http.js';
import { hashPassword } from '../lib/security.js';
import { DEFAULT_SETTINGS } from '../lib/settings.js';
import { garmentSvg } from './garments.js';
import { migrate } from './migrate.js';
import { one, pool, query } from './pool.js';

/**
 * Seed inicial: categorias, catálogo de exemplo, cupons, configurações e o
 * usuário administrador. Pode ser executado mais de uma vez com segurança:
 * o catálogo só é criado se a tabela de produtos estiver vazia.
 *   npm run seed            → cria o que falta
 *   npm run seed -- --reset → apaga TODO o banco e recria (apenas desenvolvimento)
 */

const COLORS = {
  Preto: '#1E1E1F', Branco: '#F5F5F3', 'Off-white': '#ECE6DA', 'Azul-marinho': '#1F2A44', Índigo: '#2E3D73',
  'Cinza mescla': '#9A9DA3', 'Verde-oliva': '#5B6440', Caramelo: '#A86B3C', Vinho: '#6B2433', Bege: '#CDB89A',
  'Azul-claro': '#9DB7D5', 'Rosa-antigo': '#C99A9A', Mostarda: '#C8962E', Jeans: '#4A6A94',
};
const BGS = ['#EEF0EC', '#ECEEF2', '#F0EEEC', '#E9EDF0'];

const ADULT = ['PP', 'P', 'M', 'G', 'GG'];
const KIDS = ['2', '4', '6', '8', '10', '12', '14'];
const PANTS_M = ['38', '40', '42', '44', '46'];
const PANTS_F = ['34', '36', '38', '40', '42', '44'];
const SHOES = ['34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44'];
const SHOES_KIDS = ['26', '27', '28', '29', '30', '31', '32', '33'];

const CARE = {
  camisetas: 'Lavar à mão ou na máquina em ciclo delicado, com água fria. Não usar alvejante. Secar à sombra.',
  calcas: 'Lavar do avesso, com cores semelhantes. Não usar secadora para preservar a cor e o caimento.',
  bermudas: 'Lavar do avesso, em água fria. Passar em temperatura média.',
  jaquetas: 'Lavar do avesso em ciclo delicado. Fechar zíperes e botões antes da lavagem.',
  calcados: 'Limpar com pano úmido e sabão neutro. Secar à sombra, longe do sol direto.',
  acessorios: 'Limpar com pano úmido. Não torcer. Secar à sombra.',
};

// [nome, marca, tipo, departamentos, preço, promo, cores, tamanhos, destaque, forma, peso(g), composição, texto, diasDesdeLançamento]
const PRODUCTS = [
  ['Camiseta Básica Algodão Pima', 'Trama Essentials', 'camisetas', ['masculino'], 89.9, null, ['Branco', 'Preto', 'Azul-marinho', 'Cinza mescla'], ADULT, true, 'tshirt', 200, '100% algodão pima', 'A camiseta que vai com tudo: fio pima de toque macio, gola canelada que não deforma e caimento reto.', 5],
  ['Camiseta Oversized Malha Pesada', 'Trama Essentials', 'camisetas', ['masculino', 'feminino'], 129.9, 99.9, ['Off-white', 'Verde-oliva', 'Preto'], ['P', 'M', 'G', 'GG'], true, 'tshirt', 260, '100% algodão, malha 30.1 penteada 240 g/m²', 'Ombro deslocado, manga mais longa e malha encorpada que mantém a forma depois de muitas lavagens.', 12],
  ['Camiseta Gola V Viscose', 'Atelier Lume', 'camisetas', ['feminino'], 79.9, null, ['Rosa-antigo', 'Branco', 'Preto'], ['PP', 'P', 'M', 'G'], false, 'tshirt', 160, '95% viscose, 5% elastano', 'Leve e fluida, com decote V suave. Fica bem por dentro da calça ou solta sobre a saia.', 70],
  ['Blusa Manga Curta Linho', 'Atelier Lume', 'camisetas', ['feminino'], 159.9, null, ['Bege', 'Off-white', 'Azul-claro'], ['PP', 'P', 'M', 'G', 'GG'], true, 'tshirt', 180, '100% linho', 'Linho lavado com textura natural e frescor para os dias mais quentes. Barra arredondada.', 3],
  ['Camisa Polo Piquet', 'Costa Sul', 'camisetas', ['masculino'], 149.9, 119.9, ['Azul-marinho', 'Branco', 'Verde-oliva'], ADULT, false, 'tshirt', 240, '100% algodão piquet', 'Piquet clássico com gola e punhos em ribana. Do trabalho ao fim de semana.', 90],
  ['Camiseta Infantil Algodão Orgânico', 'Vila Kids', 'camisetas', ['infantil'], 49.9, null, ['Mostarda', 'Azul-claro', 'Branco'], KIDS, false, 'tshirt', 120, '100% algodão orgânico certificado', 'Malha macia, sem etiquetas que pinicam e costuras planas para brincar o dia todo.', 20],
  ['Camiseta Infantil Manga Longa', 'Vila Kids', 'camisetas', ['infantil'], 59.9, 44.9, ['Cinza mescla', 'Vinho'], KIDS, false, 'tshirt', 140, '100% algodão', 'Manga longa com punho em ribana, ideal para manhãs frescas.', 110],
  ['Calça Jeans Slim Índigo', 'Norte Denim', 'calcas', ['masculino'], 229.9, 169.9, ['Índigo', 'Jeans', 'Preto'], PANTS_M, true, 'pants', 650, '98% algodão, 2% elastano — denim 12 oz', 'Modelagem slim com leve elasticidade, lavagem índigo escura e pespontos em linha dourada.', 40],
  ['Calça Jeans Reta Cintura Alta', 'Norte Denim', 'calcas', ['feminino'], 239.9, 179.9, ['Jeans', 'Índigo'], PANTS_F, true, 'pants', 620, '100% algodão — denim rígido 13 oz', 'Cintura alta, perna reta e barra a fio. O jeans que ganha forma com o uso.', 8],
  ['Calça Chino Sarja', 'Costa Sul', 'calcas', ['masculino'], 199.9, null, ['Caramelo', 'Bege', 'Azul-marinho'], PANTS_M, false, 'pants', 520, '97% algodão, 3% elastano — sarja', 'Corte reto com bolsos faca. Fácil de combinar com camiseta ou camisa.', 120],
  ['Calça Pantalona Linho', 'Atelier Lume', 'calcas', ['feminino'], 219.9, null, ['Off-white', 'Preto', 'Verde-oliva'], PANTS_F, false, 'pants', 380, '55% linho, 45% viscose', 'Pernas amplas e cintura com elástico nas costas. Caimento leve que acompanha o movimento.', 15],
  ['Calça Jogger Moletom', 'Trama Essentials', 'calcas', ['masculino', 'feminino'], 159.9, null, ['Cinza mescla', 'Preto'], ['P', 'M', 'G', 'GG'], false, 'pants', 480, '80% algodão, 20% poliéster — moletom flanelado', 'Moletom felpado por dentro, cós com cordão e punho na barra.', 75],
  ['Calça Infantil Jeans com Elástico', 'Vila Kids', 'calcas', ['infantil'], 89.9, null, ['Jeans'], KIDS, false, 'pants', 320, '99% algodão, 1% elastano', 'Cós com elástico regulável por dentro e joelho reforçado para as aventuras.', 140],
  ['Bermuda Sarja Clássica', 'Costa Sul', 'bermudas', ['masculino'], 139.9, null, ['Bege', 'Azul-marinho', 'Verde-oliva'], PANTS_M, false, 'shorts', 320, '98% algodão, 2% elastano', 'Comprimento na altura do joelho, bolsos laterais e passantes para cinto.', 25],
  ['Bermuda Jeans Barra Dobrada', 'Norte Denim', 'bermudas', ['masculino'], 149.9, 109.9, ['Jeans', 'Índigo'], PANTS_M, false, 'shorts', 360, '100% algodão — denim 11 oz', 'Denim lavado com barra dobrada e cinco bolsos.', 95],
  ['Short Linho Cintura Alta', 'Atelier Lume', 'bermudas', ['feminino'], 129.9, null, ['Off-white', 'Caramelo', 'Preto'], PANTS_F, true, 'shorts', 200, '55% linho, 45% viscose', 'Cintura alta com pregas frontais e bolsos embutidos.', 6],
  ['Bermuda Infantil Tactel', 'Vila Kids', 'bermudas', ['infantil'], 54.9, null, ['Azul-claro', 'Mostarda', 'Verde-oliva'], KIDS, false, 'shorts', 120, '100% poliamida', 'Secagem rápida, para a praia, o parque e a piscina.', 30],
  ['Jaqueta Jeans Trucker', 'Norte Denim', 'jaquetas', ['masculino', 'feminino'], 299.9, 239.9, ['Jeans', 'Índigo'], ['P', 'M', 'G', 'GG'], true, 'jacket', 780, '100% algodão — denim 13 oz', 'O clássico trucker com bolsos de lapela, botões de metal e pespontos duplos.', 50],
  ['Jaqueta Corta-Vento Leve', 'Passo Urbano', 'jaquetas', ['masculino'], 259.9, null, ['Preto', 'Verde-oliva', 'Azul-marinho'], ADULT, false, 'jacket', 340, '100% poliamida com acabamento repelente à água', 'Dobra no próprio bolso, capuz embutido na gola e punhos com elástico.', 10],
  ['Jaqueta Sarja Utilitária', 'Atelier Lume', 'jaquetas', ['feminino'], 289.9, null, ['Caramelo', 'Verde-oliva', 'Preto'], ['PP', 'P', 'M', 'G'], true, 'jacket', 560, '100% algodão — sarja pesada', 'Quatro bolsos frontais, cintura ajustável e modelagem levemente ampla.', 2],
  ['Jaqueta Puffer Infantil', 'Vila Kids', 'jaquetas', ['infantil'], 199.9, 159.9, ['Vinho', 'Azul-marinho', 'Mostarda'], ['4', '6', '8', '10', '12', '14'], false, 'jacket', 420, 'Externo 100% poliéster; enchimento de fibra siliconada', 'Quentinha e leve, com capuz removível e forro macio.', 130],
  ['Moletom Aberto com Zíper', 'Trama Essentials', 'jaquetas', ['masculino', 'feminino'], 189.9, null, ['Cinza mescla', 'Preto', 'Vinho'], ['P', 'M', 'G', 'GG'], false, 'jacket', 600, '80% algodão, 20% poliéster', 'Moletom flanelado com zíper inteiro e bolsos canguru.', 60],
  ['Tênis Couro Minimal', 'Passo Urbano', 'calcados', ['masculino', 'feminino'], 349.9, null, ['Branco', 'Preto'], SHOES, true, 'sneaker', 900, 'Cabedal em couro; solado de borracha costurado', 'Linhas limpas, palmilha anatômica removível e solado costurado que dura anos.', 18],
  ['Tênis de Corrida Respirável', 'Passo Urbano', 'calcados', ['masculino'], 399.9, 319.9, ['Cinza mescla', 'Azul-marinho'], ['38', '39', '40', '41', '42', '43', '44'], false, 'sneaker', 700, 'Cabedal em tela respirável; entressola em EVA', 'Amortecimento macio para treinos diários e cabedal que ventila.', 85],
  ['Tênis de Lona Casual', 'Costa Sul', 'calcados', ['masculino', 'feminino'], 179.9, null, ['Off-white', 'Preto', 'Verde-oliva'], SHOES, false, 'sneaker', 650, 'Cabedal em lona de algodão; solado vulcanizado', 'O tênis de todo dia, leve e fácil de combinar.', 45],
  ['Tênis Infantil Velcro', 'Vila Kids', 'calcados', ['infantil'], 149.9, null, ['Azul-claro', 'Rosa-antigo', 'Branco'], SHOES_KIDS, false, 'sneaker', 450, 'Cabedal sintético; solado de borracha antiderrapante', 'Fecho em velcro para a criança calçar sozinha e solado que não escorrega.', 35],
  ['Boné Aba Curva Sarja', 'Passo Urbano', 'acessorios', ['masculino', 'feminino'], 89.9, null, ['Preto', 'Bege', 'Azul-marinho'], ['Único'], false, 'cap', 120, '100% algodão — sarja', 'Seis gomos, aba curva e regulagem metálica atrás.', 55],
  ['Bolsa Tote de Lona', 'Atelier Lume', 'acessorios', ['feminino'], 149.9, 119.9, ['Off-white', 'Caramelo', 'Preto'], ['Único'], false, 'bag', 400, 'Lona de algodão 12 oz; alças em algodão', 'Espaçosa para o notebook, com bolso interno e fechamento por ímã.', 22],
  ['Boné Infantil', 'Vila Kids', 'acessorios', ['infantil'], 49.9, null, ['Mostarda', 'Azul-claro'], ['Único'], false, 'cap', 90, '100% algodão', 'Leve, com regulagem em velcro para acompanhar o crescimento.', 100],
  ['Sacola de Algodão Cru', 'Trama Essentials', 'acessorios', ['masculino', 'feminino'], 59.9, null, ['Off-white'], ['Único'], false, 'bag', 200, '100% algodão cru', 'Sacola resistente e dobrável para o mercado, a praia e a feira.', 65],
];

const CATEGORIES = [
  ['Masculino', 'masculino', 'departamento', 1, 'Roupas, calçados e acessórios masculinos.'],
  ['Feminino', 'feminino', 'departamento', 2, 'Roupas, calçados e acessórios femininos.'],
  ['Infantil', 'infantil', 'departamento', 3, 'Peças confortáveis do 2 ao 14.'],
  ['Camisetas', 'camisetas', 'tipo', 1, 'Camisetas, blusas e polos.'],
  ['Calças', 'calcas', 'tipo', 2, 'Jeans, sarja, linho e moletom.'],
  ['Bermudas', 'bermudas', 'tipo', 3, 'Bermudas e shorts para os dias quentes.'],
  ['Jaquetas', 'jaquetas', 'tipo', 4, 'Jaquetas e moletons.'],
  ['Calçados', 'calcados', 'tipo', 5, 'Tênis para o dia a dia e para treinar.'],
  ['Acessórios', 'acessorios', 'tipo', 6, 'Bonés, bolsas e sacolas.'],
];

// gerador determinístico para que o estoque inicial seja sempre o mesmo
let seedState = 42;
const rand = () => ((seedState = (seedState * 1103515245 + 12345) % 2147483648) / 2147483648);

async function seedCatalog() {
  const imgDir = path.join(config.uploadDir, 'seed');
  fs.mkdirSync(imgDir, { recursive: true });

  const catIds = {};
  for (const [name, slug, kind, order, desc] of CATEGORIES) {
    const c = await one(
      `INSERT INTO categories (name, slug, kind, sort_order, description) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [name, slug, kind, order, desc],
    );
    catIds[slug] = c.id;
  }

  const { n } = await one('SELECT count(*)::int AS n FROM products');
  if (n > 0) {
    console.log('[seed] catálogo já existe — produtos não foram recriados');
    return;
  }

  for (const [idx, row] of PRODUCTS.entries()) {
    const [name, brand, type, depts, price, sale, colors, sizes, featured, shape, weight, composition, text, daysAgo] = row;
    const slug = slugify(name);
    const description = `${text}\n\nComposição: ${composition}.\n\nCuidados: ${CARE[type]}`;
    const p = await one(
      `INSERT INTO products (name, slug, description, brand, price_cents, sale_price_cents, featured, weight_grams, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now() - ($9 || ' days')::interval) RETURNING id`,
      [name, slug, description, brand, Math.round(price * 100), sale ? Math.round(sale * 100) : null, featured, weight, String(daysAgo)],
    );
    for (const c of [type, ...depts]) {
      await query('INSERT INTO product_categories (product_id, category_id) VALUES ($1, $2)', [p.id, catIds[c]]);
    }

    // imagens: cor principal, detalhe aproximado e a segunda cor (se houver)
    const imgs = [
      { color: colors[0], zoom: false, alt: `${name} — ${colors[0]}` },
      { color: colors[0], zoom: true, alt: `${name} — detalhe` },
      ...(colors[1] ? [{ color: colors[1], zoom: false, alt: `${name} — ${colors[1]}` }] : []),
    ];
    for (const [i, img] of imgs.entries()) {
      const file = `${slug}-${i + 1}.svg`;
      const svg = garmentSvg(shape, COLORS[img.color], { bg: BGS[(idx + i) % BGS.length], zoom: img.zoom, id: `p${idx}i${i}` });
      fs.writeFileSync(path.join(imgDir, file), svg);
      await query('INSERT INTO product_images (product_id, url, alt, sort_order) VALUES ($1,$2,$3,$4)', [p.id, `/uploads/seed/${file}`, img.alt, i]);
    }

    for (const color of colors) {
      for (const size of sizes) {
        const r = rand();
        const stock = r < 0.08 ? 0 : r < 0.18 ? 1 + Math.floor(rand() * 3) : 4 + Math.floor(rand() * 22);
        const sku = `${slug.split('-').map((w) => w[0]).join('').toUpperCase()}${p.id}-${slugify(color).slice(0, 3).toUpperCase()}-${size}`;
        await query('INSERT INTO product_variants (product_id, size, color_name, color_hex, sku, stock) VALUES ($1,$2,$3,$4,$5,$6)', [
          p.id, size, color, COLORS[color], sku, stock,
        ]);
      }
    }
  }
  console.log(`[seed] ${PRODUCTS.length} produtos criados com variações, estoque e imagens`);
}

async function seedAdmin() {
  let password = config.admin.password;
  if (!password) {
    if (config.isProd) throw new Error('Defina ADMIN_PASSWORD no .env para criar o administrador em produção.');
    password = 'Admin@12345';
    console.warn('[seed] ADMIN_PASSWORD não definido — usando a senha de desenvolvimento "Admin@12345". Troque antes de publicar.');
  }
  const existing = await one('SELECT id FROM users WHERE email = $1', [config.admin.email]);
  if (existing) {
    await query(`UPDATE users SET role = 'admin' WHERE id = $1`, [existing.id]);
    console.log(`[seed] administrador já existe: ${config.admin.email}`);
    return;
  }
  await query(
    `INSERT INTO users (name, email, phone, password_hash, role, email_verified_at) VALUES ($1, $2, '', $3, 'admin', now())`,
    [config.admin.name, config.admin.email, await hashPassword(password)],
  );
  console.log(`[seed] administrador criado: ${config.admin.email}`);
}

async function seedRest() {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [key, JSON.stringify(value)]);
  }
  await query(
    `INSERT INTO coupons (code, description, discount_type, value, min_order_cents) VALUES
       ('BEMVINDO10', '10% de desconto na primeira compra', 'percent', 10, 0),
       ('VALE20', 'R$ 20 de desconto em compras acima de R$ 200', 'fixed', 2000, 20000)
     ON CONFLICT (code) DO NOTHING`,
  );
}

async function main() {
  if (process.argv.includes('--reset')) {
    if (config.isProd) throw new Error('--reset não é permitido em produção.');
    await query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    fs.rmSync(path.join(config.uploadDir, 'seed'), { recursive: true, force: true });
    console.log('[seed] banco apagado');
  }
  await migrate();
  await seedCatalog();
  await seedRest();
  await seedAdmin();
  console.log('[seed] concluído');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .then(() => pool.end())
    .catch((err) => {
      console.error('[seed] erro:', err.message);
      process.exit(1);
    });
}
