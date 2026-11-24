import express from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { one, query } from '../db/pool.js';
import { conflict, HttpError, parse } from '../lib/http.js';
import { isEmailConfigured, sendMail, templates } from '../lib/mailer.js';
import { hashPassword, isValidCpf, onlyDigits, randomToken, sha256, verifyPassword } from '../lib/security.js';
import { getSettings } from '../lib/settings.js';
import { endSession, publicUser, requireAuth, startSession } from '../middleware/auth.js';
import { rateLimit } from '../middleware/security.js';

const router = express.Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'Muitas tentativas de login. Aguarde 15 minutos.' });
const emailLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5 });

export const passwordSchema = z
  .string({ required_error: 'Informe uma senha' })
  .min(8, 'A senha precisa ter pelo menos 8 caracteres')
  .max(100, 'Senha longa demais')
  .regex(/[A-Za-z]/, 'Use pelo menos uma letra')
  .regex(/\d/, 'Use pelo menos um número');

export const cpfSchema = z
  .string()
  .optional()
  .transform((v) => (v ? onlyDigits(v) : null))
  .refine((v) => v === null || isValidCpf(v), 'CPF inválido');

export const phoneSchema = z
  .string({ required_error: 'Informe seu telefone' })
  .transform(onlyDigits)
  .refine((v) => v.length >= 10 && v.length <= 11, 'Telefone com DDD, só números');

const emailSchema = z.string({ required_error: 'Informe seu e-mail' }).trim().toLowerCase().email('E-mail inválido');

const registerSchema = z
  .object({
    name: z.string({ required_error: 'Informe seu nome' }).trim().min(3, 'Informe seu nome completo').max(120)
      .refine((v) => v.split(/\s+/).length >= 2, 'Informe nome e sobrenome'),
    email: emailSchema,
    cpf: cpfSchema,
    phone: phoneSchema,
    password: passwordSchema,
    passwordConfirm: z.string({ required_error: 'Confirme a senha' }),
  })
  .refine((d) => d.password === d.passwordConfirm, { path: ['passwordConfirm'], message: 'As senhas não coincidem' });

/** Cria token de e-mail e devolve o link. Em desenvolvimento sem SMTP, o link volta na resposta. */
async function issueEmailToken(user, purpose) {
  const token = randomToken();
  const hours = purpose === 'reset_password' ? 1 : 48;
  await query(`UPDATE email_tokens SET used_at = now() WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL`, [user.id, purpose]);
  await query(
    `INSERT INTO email_tokens (user_id, purpose, token_hash, expires_at) VALUES ($1, $2, $3, now() + ($4 || ' hours')::interval)`,
    [user.id, purpose, sha256(token), String(hours)],
  );
  const path = purpose === 'reset_password' ? 'redefinir-senha' : 'verificar-email';
  const url = `${config.appUrl}/${path}?token=${token}`;
  const { store } = await getSettings();
  const first = user.name.split(' ')[0];
  const t = purpose === 'reset_password' ? templates.resetPassword(store.name, first, url) : templates.verifyEmail(store.name, first, url);
  await sendMail({ to: user.email, ...t });
  return !config.isProd && !isEmailConfigured() ? url : undefined;
}

async function consumeToken(token, purpose) {
  const row = await one(
    `UPDATE email_tokens SET used_at = now()
      WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now()
      RETURNING user_id`,
    [sha256(String(token || '')), purpose],
  );
  if (!row) throw new HttpError(400, 'Link inválido ou expirado. Solicite um novo.');
  return row.user_id;
}

router.post('/register', loginLimiter, async (req, res) => {
  const data = parse(registerSchema, req.body);
  if (await one('SELECT 1 FROM users WHERE email = $1', [data.email])) {
    throw conflict('Este e-mail já tem cadastro. Entre ou recupere sua senha.', { fields: { email: 'E-mail já cadastrado' } });
  }
  if (data.cpf && (await one('SELECT 1 FROM users WHERE cpf = $1', [data.cpf]))) {
    throw conflict('Este CPF já está cadastrado.', { fields: { cpf: 'CPF já cadastrado' } });
  }
  const user = await one(
    `INSERT INTO users (name, email, cpf, phone, password_hash) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [data.name, data.email, data.cpf, data.phone, await hashPassword(data.password)],
  );
  await startSession(req, res, user.id);
  const devLink = await issueEmailToken(user, 'verify_email');
  res.status(201).json({ user: publicUser(user), devLink });
});

router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = parse(z.object({ email: emailSchema, password: z.string({ required_error: 'Informe sua senha' }).min(1, 'Informe sua senha') }), req.body);
  const user = await one('SELECT * FROM users WHERE email = $1', [email]);
  const ok = user ? await verifyPassword(password, user.password_hash) : await verifyPassword(password, 'scrypt$16384$8$1$AAAA$AAAA');
  if (!user || !ok) throw new HttpError(401, 'E-mail ou senha incorretos.');
  await startSession(req, res, user.id);
  res.json({ user: publicUser(user) });
});

router.post('/logout', async (req, res) => {
  await endSession(req, res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.post('/verify-email', emailLimiter, async (req, res) => {
  const userId = await consumeToken(req.body?.token, 'verify_email');
  await query('UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()), updated_at = now() WHERE id = $1', [userId]);
  res.json({ ok: true });
});

router.post('/resend-verification', requireAuth, emailLimiter, async (req, res) => {
  if (req.user.email_verified_at) return res.json({ ok: true, alreadyVerified: true });
  const devLink = await issueEmailToken(req.user, 'verify_email');
  res.json({ ok: true, devLink });
});

router.post('/forgot-password', emailLimiter, async (req, res) => {
  const { email } = parse(z.object({ email: emailSchema }), req.body);
  const user = await one('SELECT * FROM users WHERE email = $1', [email]);
  let devLink;
  if (user) devLink = await issueEmailToken(user, 'reset_password');
  // Resposta igual exista ou não a conta, para não revelar e-mails cadastrados
  res.json({ ok: true, devLink });
});

router.post('/reset-password', emailLimiter, async (req, res) => {
  const data = parse(
    z.object({ token: z.string().min(10, 'Link inválido'), password: passwordSchema, passwordConfirm: z.string() })
      .refine((d) => d.password === d.passwordConfirm, { path: ['passwordConfirm'], message: 'As senhas não coincidem' }),
    req.body,
  );
  const userId = await consumeToken(data.token, 'reset_password');
  await query('UPDATE users SET password_hash = $1, email_verified_at = COALESCE(email_verified_at, now()), updated_at = now() WHERE id = $2', [
    await hashPassword(data.password),
    userId,
  ]);
  await query('DELETE FROM sessions WHERE user_id = $1', [userId]);
  res.json({ ok: true });
});

export default router;
