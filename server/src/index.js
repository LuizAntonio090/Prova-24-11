import { createApp } from './app.js';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { pool } from './db/pool.js';

async function main() {
  await migrate({ quiet: true });
  const server = createApp().listen(config.port, () => {
    console.log(`[api] rodando em http://localhost:${config.port} (${config.env})`);
  });
  const shutdown = () => {
    server.close(() => pool.end().finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('[api] falha ao iniciar:', err.message);
  process.exit(1);
});
