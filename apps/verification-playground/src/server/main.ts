import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { sqliteStorage } from '@1hubengineering/storage-sql/sqlite';
import type { SqlStorage } from '@1hubengineering/storage-sql';
import type { ProviderId, ReceiptProvider } from '@1hubengineering/verifier';
import { createApp } from './app.ts';
import { ENV } from '../../env.ts';

const closeStorage: (() => void | Promise<void>)[] = [];

function sqlite(name: string) {
  const db = new Database(join(ENV.PLAYGROUND_DATA_DIR, name), { timeout: 5000 });
  closeStorage.push(() => {
    db.close();
  });
  db.pragma('journal_mode = WAL');
  db.pragma('secure_delete = ON');
  return db;
}

async function openLiveStorage(): Promise<SqlStorage> {
  const connection = ENV.PLAYGROUND_LIVE_DATABASE_URL;
  if (!connection) return sqliteStorage(sqlite('live.sqlite'));
  const url = new URL(connection);
  if (url.protocol === 'postgres:' || url.protocol === 'postgresql:') {
    const [{ Pool }, { postgresStorage }] = await Promise.all([
      import('pg'),
      import('@1hubengineering/storage-sql/postgres'),
    ]);
    const pool = new Pool({
      connectionString: connection,
      max: 4,
      connectionTimeoutMillis: 5000,
      statement_timeout: 5000,
    });
    pool.on('error', () => {
      process.stderr.write('The live PostgreSQL pool lost an idle connection.\n');
    });
    closeStorage.push(() => pool.end());
    return postgresStorage(pool);
  }
  if (url.protocol === 'mysql:') {
    const [{ createPool }, { mysqlStorage }] = await Promise.all([
      import('mysql2'),
      import('@1hubengineering/storage-sql/mysql'),
    ]);
    const pool = createPool({ uri: connection, connectionLimit: 4, connectTimeout: 5000 });
    closeStorage.push(() => pool.promise().end());
    return mysqlStorage(pool);
  }
  throw new TypeError('Use a supported PostgreSQL or MySQL URL for live SDK storage');
}

let app: Awaited<ReturnType<typeof createApp>> | undefined;
let closing: Promise<void> | undefined;
function close() {
  closing ??= (async () => {
    try {
      await app?.close();
    } finally {
      await Promise.allSettled(closeStorage.map(async (handle) => handle()));
    }
  })();
  return closing;
}

try {
  if (ENV.PLAYGROUND_CBE && !ENV.PLAYGROUND_LIVE)
    throw new TypeError('PLAYGROUND_CBE requires PLAYGROUND_LIVE.');
  if (
    ENV.PLAYGROUND_ORIGIN.startsWith('http:') &&
    !['127.0.0.1', '::1', 'localhost'].includes(ENV.PLAYGROUND_HOST)
  )
    throw new TypeError('Use HTTPS via a reverse proxy for non-loopback listeners.');

  process.umask(0o077);
  await mkdir(ENV.PLAYGROUND_DATA_DIR, { recursive: true, mode: 0o700 });
  const stateDb = sqlite('playground.sqlite');
  const simulated = sqliteStorage(sqlite('simulated.sqlite'));
  const live = await openLiveStorage();
  await simulated.migrate();
  await live.migrate();
  let chromiumProbe:
    | Awaited<ReturnType<typeof import('./browser.ts').checkBrowserSandbox>>
    | undefined;
  const liveProviders: Partial<Record<ProviderId, ReceiptProvider>> = {};
  if (ENV.PLAYGROUND_LIVE) {
    const { retrieveTelebirr } = await import('@1hubengineering/verifier/providers');
    const telebirrTunnelSocket = ENV.PLAYGROUND_TELEBIRR_TUNNEL_SOCKET;
    liveProviders.telebirr = {
      retrieve: telebirrTunnelSocket
        ? (input, options) => retrieveTelebirr(input, { ...options, telebirrTunnelSocket })
        : retrieveTelebirr,
    };
    if (ENV.PLAYGROUND_CBE) {
      const { checkBrowserSandbox } = await import('./browser.ts');
      try {
        chromiumProbe = await checkBrowserSandbox();
        console.log(`Chromium sandbox probe passed. ${JSON.stringify(chromiumProbe)}`);
      } catch {
        process.stderr.write(
          'CBE startup requires a working Chromium sandbox and the pinned browser runtime.\n',
        );
        throw new Error('CBE sandbox probe failed');
      }
      const { createCbeProvider } = await import('@1hubengineering/provider-cbe');
      liveProviders.cbe = createCbeProvider({ maxConcurrency: 1 });
    }
  }
  app = await createApp({
    origin: ENV.PLAYGROUND_ORIGIN,
    retentionDays: ENV.PLAYGROUND_RETENTION_DAYS,
    timeoutMs: ENV.PLAYGROUND_TIMEOUT_MS,
    stores: { simulated, live },
    stateDb,
    liveProviders,
    benchmarks: {
      source: ENV.PLAYGROUND_SOURCE_ID,
      docker: ENV.PLAYGROUND_DEPLOYMENT_ENGINE,
      storage: ENV.PLAYGROUND_STORAGE_DETAILS,
      chromium: chromiumProbe?.version ?? 'disabled',
      ...(chromiumProbe ? { chromiumProbe } : {}),
      scratch: join(ENV.PLAYGROUND_DATA_DIR, 'benchmark-scratch'),
    },
    assetsDir: fileURLToPath(new URL('../../dist/', import.meta.url)),
  });
  await app.listen({ host: ENV.PLAYGROUND_HOST, port: ENV.PLAYGROUND_PORT });
  process.stdout.write(`Playground ready on port ${ENV.PLAYGROUND_PORT}.\n`);
  const stop = () => {
    void close().catch(() => {
      process.exitCode = 1;
    });
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
} catch {
  process.stderr.write(
    'Playground startup failed. Check origin, bind address, browser sandbox, and database configuration.\n',
  );
  await close();
  process.exitCode = 1;
}
