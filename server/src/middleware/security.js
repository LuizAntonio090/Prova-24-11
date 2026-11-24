import { HttpError } from '../lib/http.js';

/** Cabeçalhos de segurança básicos (equivalente enxuto ao helmet). */
export function securityHeaders(isProd) {
  const csp = [
    "default-src 'self'",
    "img-src 'self' data: blob: https:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "script-src 'self'",
    "connect-src 'self' https://viacep.com.br",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self' https://www.mercadopago.com.br",
  ].join('; ');
  return (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (isProd) {
      res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
      if (!req.path.startsWith('/api')) res.setHeader('Content-Security-Policy', csp);
    }
    next();
  };
}

/** Lê os cookies da requisição em `req.cookies`. */
export function cookies(req, _res, next) {
  req.cookies = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    try {
      req.cookies[k] = decodeURIComponent(part.slice(idx + 1).trim());
    } catch {
      /* cookie malformado: ignora */
    }
  }
  next();
}

/**
 * Proteção CSRF: requisições que alteram dados precisam do cabeçalho
 * X-Requested-With, que formulários de outros sites não conseguem enviar.
 */
export function csrfGuard(req, _res, next) {
  const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  // o webhook do gateway é chamado servidor-a-servidor e validado por assinatura
  const isWebhook = req.originalUrl.startsWith('/api/payments/webhook/');
  if (mutating && !isWebhook && req.get('x-requested-with') !== 'XMLHttpRequest') {
    return next(new HttpError(403, 'Requisição bloqueada por segurança.'));
  }
  next();
}

/** Limitador de tentativas em memória (por IP + rota). */
export function rateLimit({ windowMs, max, message }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }, windowMs).unref();
  return (req, _res, next) => {
    const key = `${req.ip}:${req.originalUrl.split('?')[0]}`;
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.reset < now) {
      hits.set(key, { count: 1, reset: now + windowMs });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) {
      return next(new HttpError(429, message || 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'));
    }
    next();
  };
}
