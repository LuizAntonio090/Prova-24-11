import { config } from '../config.js';
import { one, query } from '../db/pool.js';
import { forbidden, HttpError, unauthorized } from '../lib/http.js';
import { randomToken, sha256 } from '../lib/security.js';

const DAY = 24 * 60 * 60 * 1000;

export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    cpf: u.cpf,
    phone: u.phone,
    role: u.role,
    emailVerified: Boolean(u.email_verified_at),
    createdAt: u.created_at,
  };
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    path: '/',
    maxAge: config.session.days * DAY,
  };
}

/** Cria a sessão no banco (apenas o hash do token é salvo) e grava o cookie. */
export async function startSession(req, res, userId) {
  const token = randomToken();
  await query(
    `INSERT INTO sessions (user_id, token_hash, user_agent, expires_at)
     VALUES ($1, $2, $3, now() + ($4 || ' days')::interval)`,
    [userId, sha256(token), String(req.get('user-agent') || '').slice(0, 300), String(config.session.days)],
  );
  await query('DELETE FROM sessions WHERE user_id = $1 AND expires_at < now()', [userId]);
  res.cookie(config.session.cookieName, token, cookieOptions());
}

export async function endSession(req, res) {
  const token = req.cookies[config.session.cookieName];
  if (token) await query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
  res.clearCookie(config.session.cookieName, { path: '/' });
}

/** Carrega o usuário da sessão (se houver) em `req.user`. */
export async function loadUser(req, res, next) {
  const token = req.cookies[config.session.cookieName];
  if (!token) return next();
  const row = await one(
    `SELECT u.*, s.id AS session_id, s.expires_at AS session_expires
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [sha256(token)],
  );
  if (!row) {
    res.clearCookie(config.session.cookieName, { path: '/' });
    return next();
  }
  // Renova sessões ativas que estão perto de expirar
  if (new Date(row.session_expires).getTime() - Date.now() < (config.session.days / 2) * DAY) {
    await query(`UPDATE sessions SET expires_at = now() + ($1 || ' days')::interval WHERE id = $2`, [
      String(config.session.days),
      row.session_id,
    ]);
    res.cookie(config.session.cookieName, token, cookieOptions());
  }
  req.user = row;
  next();
}

export const requireAuth = (req, _res, next) => (req.user ? next() : next(unauthorized()));

export const requireAdmin = (req, _res, next) => {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== 'admin') return next(forbidden('Área restrita a administradores.'));
  next();
};

export const requireVerifiedEmail = (req, _res, next) => {
  if (!req.user) return next(unauthorized());
  if (!req.user.email_verified_at) {
    return next(new HttpError(403, 'Confirme seu e-mail para finalizar a compra.', { code: 'EMAIL_NOT_VERIFIED' }));
  }
  next();
};
