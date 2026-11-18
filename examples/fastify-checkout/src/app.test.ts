import Database from 'better-sqlite3';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  createPaymentExpectation,
  createReceiptVerifier,
  parseEtbAmount,
  storageKey,
} from '@1hubengineering/receipt-verifier';
import type { ReceiptVerifier, SettlementStatus } from '@1hubengineering/receipt-verifier';
import type { ProviderResult } from '@1hubengineering/receipt-verifier/providers';
import { createDurableVerifier } from '@1hubengineering/receipt-verifier/jobs';
import { sqliteStorage } from '@1hubengineering/receipt-verifier-storage-sql/sqlite';
import type { SqlStorage } from '@1hubengineering/receipt-verifier-storage-sql';
import { createCheckoutApp } from './app.ts';
import type { CheckoutServices, HostOrder } from './app.ts';
const time = 1700000000000;
const snapshot = (tenantId = 'tenant-a', paymentId = 'payment-a') =>
  createPaymentExpectation({
    tenantId,
    paymentId,
    provider: 'telebirr',
    currency: 'ETB',
    amountMinor: parseEtbAmount('0.29'),
    recipientName: 'Synthetic Merchant',
    recipientAccountLast4: '1234',
    reference: 'SYNTHETIC_1234',
    validFrom: time,
    validUntil: time + 60000,
  });
function evidence(url: string): ProviderResult {
  return {
    kind: 'EVIDENCE',
    provenance: {
      kind: 'OFFICIAL_HTTPS',
      url,
      retrievedAt: time + 1000,
      sha256: 'a'.repeat(64),
      parserVersion: '1',
    },
    evidence: {
      provider: 'telebirr',
      currency: 'ETB',
      transactionId: url.split('/').at(-1)!,
      status: 'SUCCESSFUL',
      amountMinor: parseEtbAmount('0.29'),
      recipientName: 'Synthetic Merchant',
      recipientAccountLast4: '1234',
      reference: 'SYNTHETIC_1234',
      transactionAt: time + 500,
      paymentType: null,
      ambiguousFields: [],
    },
  };
}
let database: Database.Database,
  storage: SqlStorage,
  verifier: ReceiptVerifier,
  services: CheckoutServices,
  app: ReturnType<typeof createCheckoutApp>;
const retrieve = vi.fn(async (url: string): Promise<ProviderResult> => evidence(url));
let orders: Map<string, HostOrder>, settlement: SettlementStatus;
const headers = (token = 'alice', key = 'key-a') => ({
  authorization: `Bearer ${token}`,
  'idempotency-key': key,
});
function post(
  token = 'alice',
  key = 'key-a',
  receiptLocator = 'SYNTH1234',
  extra: Record<string, unknown> = {},
) {
  return app.inject({
    method: 'POST',
    url: '/orders/order-a/receipt-verifications',
    headers: headers(token, key),
    payload: { receiptLocator, ...extra },
  });
}
beforeEach(async () => {
  database = new Database(':memory:');
  storage = sqliteStorage(database);
  await storage.migrate();
  retrieve.mockReset().mockImplementation(async (url) => evidence(url));
  settlement = 'UNCONFIRMED';
  orders = new Map([
    ['tenant-a/order-a', { orderId: 'order-a', ownerId: 'alice', expectation: snapshot() }],
    [
      'tenant-b/order-a',
      { orderId: 'order-a', ownerId: 'bob', expectation: snapshot('tenant-b', 'payment-b') },
    ],
  ]);
  verifier = createReceiptVerifier({
    storage,
    providers: { telebirr: { retrieve } },
    now: () => time + 1000,
  });
  services = {
    verifier,
    authenticate: async (request) =>
      request.headers.authorization === 'Bearer alice'
        ? { tenantId: 'tenant-a', userId: 'alice' }
        : request.headers.authorization === 'Bearer bob'
          ? { tenantId: 'tenant-b', userId: 'bob' }
          : request.headers.authorization === 'Bearer mallory'
            ? { tenantId: 'tenant-a', userId: 'mallory' }
            : undefined,
    admit: async () => true,
    findOrder: async (tenantId, orderId) => orders.get(`${tenantId}/${orderId}`),
    readOrderState: async () => ({ settlementStatus: settlement, fulfillmentStatus: 'PENDING' }),
  };
  app = createCheckoutApp(services);
});
afterEach(async () => {
  await app.close();
  expect(database.open).toBe(true);
  database.close();
});
describe('embedded checkout authority and receipt-only boundaries', () => {
  it('authenticates and checks order/tenant ownership before registration or retrieval', async () => {
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/orders/order-a/receipt-verifications',
          headers: { 'idempotency-key': 'key' },
          payload: { receiptLocator: 'SYNTH1234' },
        })
      ).statusCode,
    ).toBe(401);
    expect((await post('mallory')).statusCode).toBe(404);
    expect(
      (await app.inject({ method: 'GET', url: '/orders/missing', headers: headers('alice') }))
        .statusCode,
    ).toBe(404);
    const spoof = await app.inject({
      method: 'POST',
      url: '/orders/order-a/receipt-verifications',
      headers: { ...headers('mallory'), 'x-tenant-id': 'tenant-a', 'x-user-id': 'alice' },
      payload: { receiptLocator: 'SYNTH1234' },
    });
    expect(spoof.statusCode).toBe(404);
    expect(retrieve).not.toHaveBeenCalled();
    expect(await storage.read(storageKey('expectation', 'tenant-a', 'payment-a'))).toBeUndefined();
  });
  it.each([
    'amountMinor',
    'recipientName',
    'recipientAccountLast4',
    'tenantId',
    'paymentId',
    'provider',
    'idempotencyKey',
  ])('rejects client authority override %s without stripping it', async (field) => {
    const response = await post('alice', 'key-a', 'SYNTH1234', { [field]: 'malicious-value' });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'INVALID_REQUEST' });
    expect(retrieve).not.toHaveBeenCalled();
  });
  it('requires a typed idempotency header, bounds bodies and refuses invalid locators', async () => {
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/orders/order-a/receipt-verifications',
          headers: { authorization: 'Bearer alice' },
          payload: { receiptLocator: 'SYNTH1234' },
        })
      ).statusCode,
    ).toBe(400);
    expect((await post('alice', 'key', 'x'.repeat(9000))).statusCode).toBe(413);
    expect((await post('alice', 'key', 'https://127.0.0.1/private')).statusCode).toBe(400);
    expect(retrieve).not.toHaveBeenCalled();
  });
  it('matches a trusted immutable snapshot while leaving settlement and fulfillment independent', async () => {
    const response = await post();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      receipt: {
        tenantId: 'tenant-a',
        paymentId: 'payment-a',
        verificationStatus: 'MATCHED_RECEIPT_ONLY',
        settlementStatus: 'UNCONFIRMED',
      },
    });
    expect(await storage.read(storageKey('claim', 'telebirr', 'SYNTH1234'))).toBeDefined();
    const order = await app.inject({ method: 'GET', url: '/orders/order-a', headers: headers() });
    expect(order.json()).toMatchObject({
      amountMinor: 29,
      settlementStatus: 'UNCONFIRMED',
      fulfillmentStatus: 'PENDING',
    });
    settlement = 'SETTLEMENT_CONFIRMED';
    expect(
      (await app.inject({ method: 'GET', url: '/orders/order-a', headers: headers() })).json(),
    ).toMatchObject({ settlementStatus: 'SETTLEMENT_CONFIRMED', fulfillmentStatus: 'PENDING' });
    expect((await post()).json()).toEqual(response.json());
    expect(retrieve).toHaveBeenCalledTimes(1);
  });
  it('replays exact inputs and rejects conflicting keys without returning another payment', async () => {
    const first = await post();
    expect((await post()).json()).toEqual(first.json());
    const conflict = await post('alice', 'key-a', 'OTHER1234');
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({
      receipt: { verificationStatus: 'IDEMPOTENCY_CONFLICT', checks: {} },
    });
    expect(retrieve).toHaveBeenCalledTimes(1);
  });
  it('coordinates receipt reuse across separately authenticated tenants', async () => {
    expect((await post()).json().receipt.verificationStatus).toBe('MATCHED_RECEIPT_ONLY');
    const other = await post('bob', 'key-b');
    expect(other.json()).toMatchObject({
      receipt: {
        tenantId: 'tenant-b',
        paymentId: 'payment-b',
        verificationStatus: 'ALREADY_CLAIMED',
        settlementStatus: 'UNCONFIRMED',
      },
    });
    expect(JSON.stringify(other.json())).not.toContain('tenant-a');
  });
  it('rejects changed host snapshots and keeps provider timeouts unclaimed', async () => {
    retrieve.mockResolvedValueOnce({ kind: 'UNAVAILABLE', code: 'TIMEOUT' });
    const response = await post();
    expect(response.json()).toMatchObject({
      receipt: { verificationStatus: 'UNABLE_TO_VERIFY', settlementStatus: 'UNCONFIRMED' },
    });
    expect(await storage.read(storageKey('claim', 'telebirr', 'SYNTH1234'))).toBeUndefined();
    orders.set('tenant-a/order-a', {
      orderId: 'order-a',
      ownerId: 'alice',
      expectation: { ...snapshot(), amountMinor: parseEtbAmount('99') },
    });
    const changed = await post('alice', 'key-b');
    expect(changed.statusCode).toBe(409);
    expect(changed.json()).toEqual({ error: 'EXPECTATION_EXISTS' });
    expect(retrieve).toHaveBeenCalledTimes(1);
  });
  it('bounds concurrent retrieval and restores capacity after the first request finishes', async () => {
    let release!: () => void, entered!: () => void;
    const begun = new Promise<void>((r) => {
      entered = r;
    });
    retrieve.mockImplementationOnce(async (url) => {
      entered();
      await new Promise<void>((r) => {
        release = r;
      });
      return evidence(url);
    });
    const first = post();
    await begun;
    const busy = await post('alice', 'key-b', 'OTHER1234');
    expect(busy.statusCode).toBe(429);
    expect(busy.headers['retry-after']).toBe('1');
    release();
    expect((await first).statusCode).toBe(200);
    expect((await post()).statusCode).toBe(200);
    expect(retrieve).toHaveBeenCalledTimes(1);
  });
  it('honors host admission before order lookup and omits private error details', async () => {
    await app.close();
    const findOrder = vi.fn((tenantId: string, orderId: string) =>
      services.findOrder(tenantId, orderId),
    );
    app = createCheckoutApp({ ...services, admit: async () => false, findOrder });
    expect((await post()).statusCode).toBe(429);
    expect(findOrder).not.toHaveBeenCalled();
    expect(retrieve).not.toHaveBeenCalled();
    await app.close();
    app = createCheckoutApp({
      ...services,
      findOrder: async () => {
        throw new Error('private URL or credential');
      },
    });
    const failed = await post();
    expect(failed.statusCode).toBe(503);
    expect(failed.json()).toEqual({ error: 'UNAVAILABLE' });
  });
  it('returns committed 202 jobs, enforces queue capacity and scopes status before work', async () => {
    await app.close();
    const jobs = createDurableVerifier({
      storage,
      providers: { telebirr: { retrieve } },
      encryptionKey: new Uint8Array(32).fill(1),
      policy: { maxPending: 1, maxRetained: 2 },
      now: () => time + 1000,
    });
    await jobs.initialize();
    app = createCheckoutApp({ ...services, jobs });
    const response = await post();
    expect(response.statusCode).toBe(202);
    const jobId = response.json().job.jobId as string;
    expect(response.json().job).toMatchObject({ state: 'QUEUED', settlementStatus: 'UNCONFIRMED' });
    expect(retrieve).not.toHaveBeenCalled();
    expect((await post()).json()).toEqual(response.json());
    expect((await post('bob', 'key-b', 'OTHER1234')).statusCode).toBe(429);
    const url = `/orders/order-a/receipt-verifications/${jobId}`;
    expect((await app.inject({ method: 'GET', url, headers: headers('bob') })).statusCode).toBe(
      404,
    );
    expect(await jobs.runOnce()).toBe('COMPLETED');
    expect((await app.inject({ method: 'GET', url, headers: headers() })).json()).toMatchObject({
      job: {
        state: 'COMPLETED',
        result: { verificationStatus: 'MATCHED_RECEIPT_ONLY', settlementStatus: 'UNCONFIRMED' },
      },
    });
    expect(
      (await app.inject({ method: 'GET', url: '/orders/order-a', headers: headers() })).json(),
    ).toMatchObject({ settlementStatus: 'UNCONFIRMED', fulfillmentStatus: 'PENDING' });
  });
});
