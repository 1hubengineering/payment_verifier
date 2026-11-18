import { createDurableVerifier } from '@1hubengineering/verifier/jobs';
import { jobTestKey, jobTestPolicy } from './fixtures.ts';
import { createReceiptVerifier, parseEtbAmount } from '@1hubengineering/verifier';

const [engine, inputText, mode, jobTime] = process.argv.slice(2);
const input = JSON.parse(inputText);
let storage,
  close = async () => {};
try {
  const baseEngine = engine.replace(/^(?:drizzle|prisma)-/, '');
  let host;
  if (baseEngine === 'postgres') {
    const { Pool } = await import('pg');
    const { postgresStorage } = await import('@1hubengineering/storage-sql/postgres');
    const pool = new Pool({ connectionString: process.env.RECEIPT_TEST_POSTGRES_URL });
    storage = postgresStorage(pool);
    host = pool;
    close = () => pool.end();
  } else if (baseEngine === 'mysql') {
    const { createPool } = await import('mysql2');
    const { mysqlStorage } = await import('@1hubengineering/storage-sql/mysql');
    const pool = createPool(process.env.RECEIPT_TEST_MYSQL_URL);
    storage = mysqlStorage(pool);
    host = pool;
    close = () => pool.promise().end();
  } else if (engine === 'sqlite') {
    const { default: Database } = await import('better-sqlite3');
    const { sqliteStorage } = await import('@1hubengineering/storage-sql/sqlite');
    const database = new Database(process.env.RECEIPT_TEST_SQLITE_FILE, { timeout: 20 });
    storage = sqliteStorage(database);
    close = async () => database.close();
  }
  if (engine.startsWith('drizzle-')) {
    if (baseEngine === 'postgres') {
      const { drizzle } = await import('drizzle-orm/node-postgres');
      const { drizzlePostgresStorage } = await import('@1hubengineering/adapter-drizzle/postgres');
      storage = drizzlePostgresStorage(drizzle({ client: host }));
    } else if (baseEngine === 'mysql') {
      const { drizzle } = await import('drizzle-orm/mysql2');
      const { drizzleMysqlStorage } = await import('@1hubengineering/adapter-drizzle/mysql');
      storage = drizzleMysqlStorage(drizzle({ client: host.promise() }));
    } else {
      const { createClient } = await import('@libsql/client');
      const { drizzle } = await import('drizzle-orm/libsql');
      const { drizzleSqliteStorage } = await import('@1hubengineering/adapter-drizzle/sqlite');
      const client = createClient({ url: 'file:' + process.env.RECEIPT_TEST_SQLITE_FILE });
      storage = drizzleSqliteStorage(drizzle({ client }));
      const originalClose = close;
      close = async () => {
        client.close();
        await originalClose();
      };
    }
  }
  if (engine.startsWith('prisma-')) {
    const { prismaStorage } = await import('@1hubengineering/adapter-prisma');
    const { PrismaClient } = await import(`../generated/${baseEngine}/client.ts`);
    let adapter;
    if (baseEngine === 'postgres') {
      const { PrismaPg } = await import('@prisma/adapter-pg');
      adapter = new PrismaPg({ connectionString: process.env.RECEIPT_TEST_POSTGRES_URL });
    } else if (baseEngine === 'mysql') {
      const { PrismaMariaDb } = await import('@prisma/adapter-mariadb');
      adapter = new PrismaMariaDb(process.env.RECEIPT_TEST_MYSQL_URL);
    } else {
      const { PrismaBetterSqlite3 } = await import('@prisma/adapter-better-sqlite3');
      adapter = new PrismaBetterSqlite3({
        url: 'file:' + process.env.RECEIPT_TEST_SQLITE_FILE,
        timeout: 20,
      });
    }
    const client = new PrismaClient({ adapter });
    storage = prismaStorage(client);
    const originalClose = close;
    close = async () => {
      await client.$disconnect();
      await originalClose();
    };
  }
  const time = 1700000000000;
  const providers = {
    telebirr: {
      async retrieve(url) {
        if (mode === 'job-crash') {
          process.send({ ready: true });
          await new Promise((resolve) => process.once('message', resolve));
          throw new Error('Synthetic crash worker unexpectedly resumed');
        }
        if (mode === 'replay') throw new Error('Replay must not retrieve');
        return {
          kind: 'EVIDENCE',
          provenance: {
            kind: 'OFFICIAL_HTTPS',
            url,
            sha256: 'a'.repeat(64),
            parserVersion: '1',
            retrievedAt: time + 1000,
          },
          evidence: {
            provider: 'telebirr',
            currency: 'ETB',
            transactionId: url.split('/').at(-1),
            status: 'SUCCESSFUL',
            amountMinor: parseEtbAmount('0.29'),
            recipientName: 'Synthetic Merchant',
            recipientAccountLast4: '1234',
            reference: 'ORDER_1234',
            transactionAt: time + 500,
            paymentType: null,
            ambiguousFields: [],
          },
        };
      },
    },
  };
  if (mode === 'job-crash') {
    const jobs = createDurableVerifier({
      storage,
      providers,
      encryptionKey: jobTestKey,
      policy: jobTestPolicy,
      now: () => Number(jobTime),
    });
    await jobs.initialize();
    await jobs.runOnce();
    throw new Error('Synthetic worker did not reach retrieval');
  }
  const verifier = createReceiptVerifier({ storage, providers, now: () => time + 1000 });
  const prepared = await verifier.prepare(input);
  process.send({ ready: true });
  await new Promise((resolve) => process.once('message', resolve));
  const result = await verifier.complete(prepared);
  process.send({ result });
  await close();
  process.disconnect();
} catch (error) {
  process.send?.({ error: error.code ?? error.name });
  await close?.();
  process.exitCode = 1;
  process.disconnect?.();
}
