import express from 'express';
import { z } from 'zod';
import { many, one, query, transaction } from '../db/pool.js';
import { conflict, HttpError, notFound, parse } from '../lib/http.js';
import { hashPassword, onlyDigits, verifyPassword } from '../lib/security.js';
import { publicUser, requireAuth } from '../middleware/auth.js';
import { CARD_COLUMNS, serializeCard } from '../services/catalog.js';
import { cpfSchema, passwordSchema, phoneSchema } from './auth.js';

const router = express.Router();
router.use(requireAuth);

router.put('/profile', async (req, res) => {
  const data = parse(
    z.object({
      name: z.string().trim().min(3, 'Informe seu nome completo').max(120),
      phone: phoneSchema,
      cpf: cpfSchema,
    }),
    req.body,
  );
  if (data.cpf && (await one('SELECT 1 FROM users WHERE cpf = $1 AND id <> $2', [data.cpf, req.user.id]))) {
    throw conflict('Este CPF já está em outra conta.', { fields: { cpf: 'CPF já cadastrado' } });
  }
  const user = await one(
    'UPDATE users SET name = $1, phone = $2, cpf = $3, updated_at = now() WHERE id = $4 RETURNING *',
    [data.name, data.phone, data.cpf, req.user.id],
  );
  res.json({ user: publicUser(user) });
});

router.put('/password', async (req, res) => {
  const data = parse(
    z.object({ currentPassword: z.string().min(1, 'Informe a senha atual'), password: passwordSchema, passwordConfirm: z.string() })
      .refine((d) => d.password === d.passwordConfirm, { path: ['passwordConfirm'], message: 'As senhas não coincidem' }),
    req.body,
  );
  if (!(await verifyPassword(data.currentPassword, req.user.password_hash))) {
    throw new HttpError(422, 'Senha atual incorreta.', { fields: { currentPassword: 'Senha atual incorreta' } });
  }
  await query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [await hashPassword(data.password), req.user.id]);
  // encerra as outras sessões, mantendo a atual
  await query('DELETE FROM sessions WHERE user_id = $1 AND id <> $2', [req.user.id, req.user.session_id]);
  res.json({ ok: true });
});

// ---------- Endereços ----------
const UF = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const addressSchema = z.object({
  label: z.string().trim().max(30).default('Casa'),
  recipient: z.string().trim().min(3, 'Informe quem vai receber').max(120),
  cep: z.string().transform(onlyDigits).refine((v) => v.length === 8, 'CEP com 8 números'),
  street: z.string().trim().min(2, 'Informe a rua').max(150),
  number: z.string().trim().min(1, 'Informe o número').max(20),
  complement: z.string().trim().max(80).default(''),
  district: z.string().trim().min(2, 'Informe o bairro').max(80),
  city: z.string().trim().min(2, 'Informe a cidade').max(80),
  state: z.string().trim().toUpperCase().refine((v) => UF.includes(v), 'UF inválida'),
  isDefault: z.boolean().default(false),
});

const serializeAddress = (a) => ({
  id: a.id, label: a.label, recipient: a.recipient, cep: a.cep, street: a.street, number: a.number,
  complement: a.complement, district: a.district, city: a.city, state: a.state, isDefault: a.is_default,
});

router.get('/addresses', async (req, res) => {
  const rows = await many('SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, id', [req.user.id]);
  res.json({ addresses: rows.map(serializeAddress) });
});

async function saveAddress(userId, data, id) {
  return transaction(async (db) => {
    const count = await one('SELECT count(*)::int AS n FROM addresses WHERE user_id = $1', [userId], db);
    const makeDefault = data.isDefault || count.n === 0 || (id && count.n === 1);
    if (makeDefault) await db.query('UPDATE addresses SET is_default = false WHERE user_id = $1', [userId]);
    const vals = [data.label || 'Casa', data.recipient, data.cep, data.street, data.number, data.complement, data.district, data.city, data.state, makeDefault];
    if (id) {
      const row = await one(
        `UPDATE addresses SET label=$1, recipient=$2, cep=$3, street=$4, number=$5, complement=$6, district=$7, city=$8, state=$9,
                is_default = CASE WHEN $10 THEN true ELSE is_default END
          WHERE id = $11 AND user_id = $12 RETURNING *`,
        [...vals, id, userId],
        db,
      );
      if (!row) throw notFound('Endereço não encontrado.');
      return row;
    }
    if (count.n >= 10) throw new HttpError(422, 'Limite de 10 endereços atingido.');
    return one(
      `INSERT INTO addresses (label, recipient, cep, street, number, complement, district, city, state, is_default, user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [...vals, userId],
      db,
    );
  });
}

router.post('/addresses', async (req, res) => {
  const row = await saveAddress(req.user.id, parse(addressSchema, req.body));
  res.status(201).json({ address: serializeAddress(row) });
});

router.put('/addresses/:id', async (req, res) => {
  const row = await saveAddress(req.user.id, parse(addressSchema, req.body), Number(req.params.id));
  res.json({ address: serializeAddress(row) });
});

router.delete('/addresses/:id', async (req, res) => {
  const row = await one('DELETE FROM addresses WHERE id = $1 AND user_id = $2 RETURNING is_default', [Number(req.params.id), req.user.id]);
  if (!row) throw notFound('Endereço não encontrado.');
  if (row.is_default) {
    await query(
      'UPDATE addresses SET is_default = true WHERE id = (SELECT id FROM addresses WHERE user_id = $1 ORDER BY id LIMIT 1)',
      [req.user.id],
    );
  }
  res.json({ ok: true });
});

// ---------- Favoritos ----------
router.get('/favorites', async (req, res) => {
  const rows = await many(
    `SELECT ${CARD_COLUMNS} FROM v_products p JOIN favorites f ON f.product_id = p.id
      WHERE f.user_id = $1 AND p.active ORDER BY f.created_at DESC`,
    [req.user.id],
  );
  res.json({ items: rows.map(serializeCard), ids: rows.map((r) => r.id) });
});

router.post('/favorites', async (req, res) => {
  const { productId } = parse(z.object({ productId: z.coerce.number().int().positive() }), req.body);
  if (!(await one('SELECT 1 FROM products WHERE id = $1 AND active', [productId]))) throw notFound('Produto não encontrado.');
  await query('INSERT INTO favorites (user_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.user.id, productId]);
  res.status(201).json({ ok: true });
});

router.delete('/favorites/:productId', async (req, res) => {
  await query('DELETE FROM favorites WHERE user_id = $1 AND product_id = $2', [req.user.id, Number(req.params.productId)]);
  res.json({ ok: true });
});

export default router;
