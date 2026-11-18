import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import {
  createPaymentExpectation,
  createReceiptVerifier,
  parseEtbAmount,
} from '@1hubengineering/receipt-verifier';
import { sqliteStorage } from '@1hubengineering/receipt-verifier-storage-sql/sqlite';
import { ENV } from '../env.ts';
import { createCheckoutApp } from './app.ts';

// Public synthetic local demo credentials. Integrators inject their existing auth.
const database = new Database(
  ENV.CHECKOUT_DATABASE_FILE ??
    fileURLToPath(new URL('../../../.receipt-checkout-demo.sqlite', import.meta.url)),
  { timeout: 5000 },
);
let app: ReturnType<typeof createCheckoutApp> | undefined;
const close = async (): Promise<void> => {
  await app?.close();
  if (database.open) database.close();
};
const stop = (): void => {
  void close().catch(() => {
    process.exitCode = 1;
  });
};
try {
  database.pragma('journal_mode = WAL');
  const storage = sqliteStorage(database);
  await storage.migrate();
  const verifier = createReceiptVerifier({ storage, providers: {} });
  const expectation = createPaymentExpectation({
    tenantId: 'synthetic-merchant',
    paymentId: 'synthetic-payment',
    provider: 'telebirr',
    currency: 'ETB',
    amountMinor: parseEtbAmount('0.29'),
    recipientName: 'Synthetic Merchant',
    recipientAccountLast4: '1234',
    reference: 'SYNTHETIC_1234',
    validFrom: 0,
    validUntil: 4102444800000,
  });
  const order = Object.freeze({
    orderId: 'synthetic-order',
    ownerId: 'synthetic-customer',
    expectation,
  });
  let windowStart = Date.now(),
    admitted = 0;
  app = createCheckoutApp({
    verifier,
    authenticate: async (request) =>
      request.headers.authorization === 'Bearer synthetic-customer-a'
        ? { tenantId: expectation.tenantId, userId: order.ownerId }
        : undefined,
    admit: async () => {
      if (Date.now() - windowStart >= 60000) {
        windowStart = Date.now();
        admitted = 0;
      }
      return ++admitted <= 20;
    },
    findOrder: async (tenantId, orderId) =>
      tenantId === expectation.tenantId && orderId === order.orderId ? order : undefined,
    readOrderState: async () => ({ settlementStatus: 'UNCONFIRMED', fulfillmentStatus: 'PENDING' }),
  });
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  await app.listen({ host: '127.0.0.1', port: ENV.CHECKOUT_PORT });
  process.stdout.write(
    JSON.stringify({ demo: 'SYNTHETIC_NO_PROVIDERS', host: '127.0.0.1', port: ENV.CHECKOUT_PORT }) +
      '\n',
  );
} catch {
  await close();
  process.stderr.write(JSON.stringify({ error: 'DEMO_UNAVAILABLE' }) + '\n');
  process.exitCode = 1;
}
