import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
});

pool.on('error', (err) => console.error('[db] erro inesperado no pool', err));

/** Executa uma consulta e retorna o resultado completo. */
export const query = (text, params) => pool.query(text, params);

/** Retorna a primeira linha (ou null). Aceita um client de transação opcional. */
export async function one(text, params, client = pool) {
  const r = await client.query(text, params);
  return r.rows[0] || null;
}

/** Retorna todas as linhas. */
export async function many(text, params, client = pool) {
  const r = await client.query(text, params);
  return r.rows;
}

/** Executa `fn` dentro de uma transação. */
export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
