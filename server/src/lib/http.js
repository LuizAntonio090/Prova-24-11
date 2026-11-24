import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const badRequest = (msg, extra) => new HttpError(400, msg, extra);
export const unauthorized = (msg = 'Entre na sua conta para continuar.') => new HttpError(401, msg);
export const forbidden = (msg = 'Você não tem permissão para esta ação.') => new HttpError(403, msg);
export const notFound = (msg = 'Não encontrado.') => new HttpError(404, msg);
export const conflict = (msg, extra) => new HttpError(409, msg, extra);

/** Valida `data` com um schema zod; lança 422 com os erros por campo. */
export function parse(schema, data) {
  const result = schema.safeParse(data ?? {});
  if (result.success) return result.data;
  throw validationError(result.error);
}

export function validationError(error) {
  const fields = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  return new HttpError(422, 'Revise os campos destacados.', { fields });
}

export function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) err = validationError(err);
  if (err?.type === 'entity.parse.failed') err = badRequest('Corpo da requisição inválido.');
  if (err?.type === 'entity.too.large') err = new HttpError(413, 'Arquivo ou requisição grande demais.');
  if (err?.code === '23505') err = conflict('Já existe um registro com esses dados.');
  if (err?.code === '23503') err = conflict('Este registro está em uso e não pode ser alterado assim.');

  const status = err instanceof HttpError ? err.status : err?.status && err.status < 600 ? err.status : 500;
  if (status >= 500) console.error('[erro]', req.method, req.originalUrl, err);
  res.status(status).json({
    error: status >= 500 && !(err instanceof HttpError) ? 'Erro interno. Tente novamente em instantes.' : err.message,
    ...(err.extra || {}),
  });
}

/** Converte um texto em slug URL-amigável. */
export function slugify(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export const toInt = (v, fallback) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};

export const listParam = (v) =>
  (Array.isArray(v) ? v.join(',') : String(v || ''))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
