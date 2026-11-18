import { createReceiptVerifier, parseEtbAmount } from '@andhub/receipt-verifier';

const [engine, inputText, mode] = process.argv.slice(2);
const input = JSON.parse(inputText);
let storage, close;
try {
  if (engine === 'postgres') {
    const { Pool } = await import('pg');
    const { postgresStorage } = await import('@andhub/receipt-verifier-storage-sql/postgres');
    const pool = new Pool({ connectionString: process.env.RECEIPT_TEST_POSTGRES_URL });
    storage = postgresStorage(pool);
    close = () => pool.end();
  } else if (engine === 'mysql') {
    const { createPool } = await import('mysql2');
    const { mysqlStorage } = await import('@andhub/receipt-verifier-storage-sql/mysql');
    const pool = createPool(process.env.RECEIPT_TEST_MYSQL_URL);
    storage = mysqlStorage(pool);
    close = () => pool.promise().end();
  } else {
    const { default: Database } = await import('better-sqlite3');
    const { sqliteStorage } = await import('@andhub/receipt-verifier-storage-sql/sqlite');
    const database = new Database(process.env.RECEIPT_TEST_SQLITE_FILE, { timeout: 20 });
    storage = sqliteStorage(database);
    close = async () => database.close();
  }
  const time = 1700000000000;
  const verifier = createReceiptVerifier({
    storage,
    now: () => time + 1000,
    providers: {
      telebirr: {
        async retrieve(url) {
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
    },
  });
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
