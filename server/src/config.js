import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = path.resolve(__dirname, '..');
export const PROJECT_ROOT = path.resolve(SERVER_ROOT, '..');

// Carrega o .env da raiz do projeto (ou de server/) sem dependências externas
for (const file of [path.join(PROJECT_ROOT, '.env'), path.join(SERVER_ROOT, '.env')]) {
  if (fs.existsSync(file)) {
    process.loadEnvFile(file);
    break;
  }
}

const env = process.env;
const isProd = env.NODE_ENV === 'production';
const port = Number(env.PORT || 3333);

export const config = {
  env: env.NODE_ENV || 'development',
  isProd,
  port,
  databaseUrl: env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/loja',
  databaseSsl: env.DATABASE_SSL === 'true',
  // URL pública do front-end (usada nos links de e-mail e retorno do pagamento)
  appUrl: (env.APP_URL || 'http://localhost:5173').replace(/\/$/, ''),
  // URL pública da API (usada como notification_url do gateway). Precisa ser HTTPS em produção.
  publicApiUrl: (env.PUBLIC_API_URL || `http://localhost:${port}`).replace(/\/$/, ''),
  trustProxy: env.TRUST_PROXY === 'true',
  session: {
    cookieName: env.SESSION_COOKIE_NAME || 'loja_sid',
    days: Number(env.SESSION_DAYS || 30),
  },
  smtp: {
    host: env.SMTP_HOST || '',
    port: Number(env.SMTP_PORT || 587),
    secure: env.SMTP_SECURE === 'true',
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from: env.MAIL_FROM || 'Loja <no-reply@localhost>',
  },
  mercadoPago: {
    accessToken: env.MP_ACCESS_TOKEN || '',
    webhookSecret: env.MP_WEBHOOK_SECRET || '',
  },
  admin: {
    name: env.ADMIN_NAME || 'Administrador',
    email: (env.ADMIN_EMAIL || 'admin@loja.local').toLowerCase(),
    password: env.ADMIN_PASSWORD || '',
  },
  uploadDir: path.join(SERVER_ROOT, 'uploads'),
  clientDist: path.join(PROJECT_ROOT, 'client', 'dist'),
};
