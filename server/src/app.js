import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { config } from './config.js';
import { errorHandler, notFound } from './lib/http.js';
import { loadUser, requireAdmin } from './middleware/auth.js';
import { cookies, csrfGuard, securityHeaders } from './middleware/security.js';
import accountRoutes from './routes/account.js';
import adminProducts from './routes/admin/products.js';
import adminStore from './routes/admin/store.js';
import authRoutes from './routes/auth.js';
import catalogRoutes from './routes/catalog.js';
import orderRoutes from './routes/orders.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  app.use(securityHeaders(config.isProd));
  app.use(cookies);

  // imagens enviadas pelo painel e imagens geradas pelo seed
  // (em hospedagens sem disco gravável, como a Vercel, as imagens ficam no banco: /api/media/:id)
  if (fs.existsSync(config.uploadDir)) {
    app.use('/uploads', express.static(config.uploadDir, { maxAge: 7 * 24 * 3600 * 1000 }));
  }

  const api = express.Router();
  api.use(express.json({ limit: '200kb' }));
  api.use(csrfGuard);
  api.use(loadUser);
  api.get('/health', (_req, res) => res.json({ ok: true }));
  api.use('/auth', authRoutes);
  api.use('/account', accountRoutes);
  api.use('/', catalogRoutes);
  api.use('/', orderRoutes);
  api.use('/admin', requireAdmin, adminProducts);
  api.use('/admin', requireAdmin, adminStore);
  api.use((req, _res, next) => next(notFound('Rota da API não encontrada.')));
  app.use('/api', api);

  // Em produção, o próprio servidor entrega o front-end compilado (client/dist)
  if (fs.existsSync(path.join(config.clientDist, 'index.html'))) {
    app.use(express.static(config.clientDist, { index: false, maxAge: 0, setHeaders: (res, file) => {
      if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.originalUrl.startsWith('/api') || req.originalUrl.startsWith('/uploads')) return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(config.clientDist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
