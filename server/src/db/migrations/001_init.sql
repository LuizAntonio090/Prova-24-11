-- Estrutura inicial da loja

CREATE TABLE users (
  id                SERIAL PRIMARY KEY,
  name              TEXT NOT NULL,
  email             TEXT NOT NULL UNIQUE,
  cpf               TEXT,
  phone             TEXT,
  password_hash     TEXT NOT NULL,
  role              TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
  email_verified_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_cpf_unique ON users (cpf) WHERE cpf IS NOT NULL;

CREATE TABLE sessions (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  user_agent  TEXT,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE email_tokens (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose     TEXT NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  kind        TEXT NOT NULL CHECK (kind IN ('departamento', 'tipo')),
  description TEXT NOT NULL DEFAULT '',
  sort_order  INT NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id               SERIAL PRIMARY KEY,
  name             TEXT NOT NULL,
  slug             TEXT NOT NULL UNIQUE,
  description      TEXT NOT NULL DEFAULT '',
  brand            TEXT NOT NULL,
  price_cents      INT NOT NULL CHECK (price_cents > 0),
  sale_price_cents INT CHECK (sale_price_cents IS NULL OR (sale_price_cents > 0 AND sale_price_cents < price_cents)),
  sale_ends_at     TIMESTAMPTZ,
  featured         BOOLEAN NOT NULL DEFAULT false,
  active           BOOLEAN NOT NULL DEFAULT true,
  weight_grams     INT NOT NULL DEFAULT 300 CHECK (weight_grams > 0),
  sold_count       INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX products_brand_idx ON products (brand);

CREATE TABLE product_categories (
  product_id  INT NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  category_id INT NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, category_id)
);

CREATE TABLE product_images (
  id         SERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  alt        TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0
);
CREATE INDEX product_images_product_idx ON product_images (product_id);

-- Estoque: cada combinação de tamanho e cor é uma variante com sua quantidade
CREATE TABLE product_variants (
  id         SERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  size       TEXT NOT NULL,
  color_name TEXT NOT NULL,
  color_hex  TEXT NOT NULL DEFAULT '#888888',
  sku        TEXT NOT NULL UNIQUE,
  stock      INT NOT NULL DEFAULT 0 CHECK (stock >= 0),
  UNIQUE (product_id, size, color_name)
);
CREATE INDEX product_variants_product_idx ON product_variants (product_id);

CREATE TABLE addresses (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  label       TEXT NOT NULL DEFAULT 'Casa',
  recipient   TEXT NOT NULL,
  cep         TEXT NOT NULL,
  street      TEXT NOT NULL,
  number      TEXT NOT NULL,
  complement  TEXT NOT NULL DEFAULT '',
  district    TEXT NOT NULL,
  city        TEXT NOT NULL,
  state       CHAR(2) NOT NULL,
  is_default  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX addresses_user_idx ON addresses (user_id);

CREATE TABLE favorites (
  user_id    INT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE coupons (
  id              SERIAL PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE,
  description     TEXT NOT NULL DEFAULT '',
  discount_type   TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  value           INT NOT NULL CHECK (value > 0),
  min_order_cents INT NOT NULL DEFAULT 0,
  max_uses        INT,
  used_count      INT NOT NULL DEFAULT 0,
  starts_at       TIMESTAMPTZ,
  ends_at         TIMESTAMPTZ,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE orders (
  id               SERIAL PRIMARY KEY,
  user_id          INT NOT NULL REFERENCES users (id),
  status           TEXT NOT NULL DEFAULT 'aguardando_pagamento'
                   CHECK (status IN ('aguardando_pagamento', 'pago', 'em_separacao', 'enviado', 'entregue', 'cancelado')),
  subtotal_cents   INT NOT NULL,
  discount_cents   INT NOT NULL DEFAULT 0,
  shipping_cents   INT NOT NULL DEFAULT 0,
  total_cents      INT NOT NULL,
  coupon_id        INT REFERENCES coupons (id) ON DELETE SET NULL,
  coupon_code      TEXT,
  shipping_method  TEXT NOT NULL,
  shipping_label   TEXT NOT NULL,
  shipping_days    TEXT NOT NULL,
  shipping_address JSONB NOT NULL,
  payment_method   TEXT NOT NULL CHECK (payment_method IN ('pix', 'card', 'boleto')),
  tracking_code    TEXT,
  paid_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX orders_user_idx ON orders (user_id);
CREATE INDEX orders_status_idx ON orders (status);
CREATE INDEX orders_created_idx ON orders (created_at);

CREATE TABLE order_items (
  id               SERIAL PRIMARY KEY,
  order_id         INT NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  product_id       INT REFERENCES products (id) ON DELETE SET NULL,
  variant_id       INT REFERENCES product_variants (id) ON DELETE SET NULL,
  product_name     TEXT NOT NULL,
  product_slug     TEXT NOT NULL,
  size             TEXT NOT NULL,
  color_name       TEXT NOT NULL,
  image_url        TEXT,
  unit_price_cents INT NOT NULL,
  quantity         INT NOT NULL CHECK (quantity > 0)
);
CREATE INDEX order_items_order_idx ON order_items (order_id);

CREATE TABLE order_status_history (
  id         SERIAL PRIMARY KEY,
  order_id   INT NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  status     TEXT NOT NULL,
  note       TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payments (
  id                  SERIAL PRIMARY KEY,
  order_id            INT NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  provider            TEXT NOT NULL DEFAULT 'mercadopago',
  method              TEXT NOT NULL CHECK (method IN ('pix', 'card', 'boleto')),
  status              TEXT NOT NULL CHECK (status IN ('not_configured', 'error', 'pending', 'approved', 'rejected', 'cancelled', 'refunded')),
  amount_cents        INT NOT NULL,
  provider_payment_id TEXT,
  preference_id       TEXT,
  pix_qr_code         TEXT,
  pix_qr_base64       TEXT,
  ticket_url          TEXT,
  checkout_url        TEXT,
  barcode             TEXT,
  expires_at          TIMESTAMPTZ,
  error_message       TEXT,
  raw                 JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX payments_order_idx ON payments (order_id);
CREATE UNIQUE INDEX payments_provider_id_unique ON payments (provider, provider_payment_id) WHERE provider_payment_id IS NOT NULL;

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE newsletter_subscribers (
  id         SERIAL PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Visão com o preço efetivo (considera promoção vigente) e o estoque total
CREATE VIEW v_products AS
SELECT p.*,
  CASE WHEN p.sale_price_cents IS NOT NULL AND (p.sale_ends_at IS NULL OR p.sale_ends_at > now())
       THEN p.sale_price_cents ELSE p.price_cents END AS effective_price_cents,
  (p.sale_price_cents IS NOT NULL AND (p.sale_ends_at IS NULL OR p.sale_ends_at > now())) AS on_sale,
  COALESCE((SELECT SUM(v.stock) FROM product_variants v WHERE v.product_id = p.id), 0)::int AS total_stock,
  (SELECT i.url FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order, i.id LIMIT 1) AS image_url,
  (SELECT i.url FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order, i.id OFFSET 1 LIMIT 1) AS image_url_2
FROM products p;
