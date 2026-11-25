-- Imagens guardadas no próprio banco: funciona em hospedagens sem disco
-- persistente (Vercel e outras plataformas serverless).
CREATE TABLE media (
  id         SERIAL PRIMARY KEY,
  mime       TEXT NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp', 'image/svg+xml')),
  data       BYTEA NOT NULL,
  size       INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
