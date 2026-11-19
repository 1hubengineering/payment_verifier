import Database from 'better-sqlite3';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  createPaymentExpectation,
  createReceiptVerifier,
  parseEtbAmount,
  storageKey,
} from '@1hubengineering/verifier';
import type { ReceiptVerifier } from '@1hubengineering/verifier';
import type { ProviderResult } from '@1hubengineering/verifier/providers';
import { createDurableVerifier } from '@1hubengineering/verifier/jobs';
import { sqliteStorage } from '@1hubengineering/storage-sql/sqlite';
import type { SqlStorage } from '@1hubengineering/storage-sql';
import { createCheckoutApp } from './app.ts';
import type { CheckoutServices, HostOrder } from './app.ts';
const time = 1700000000000;
const telebirrUrl = 'https://transactioninfo.ethiotelecom.et/receipt/SYNTH1234';
const cbeUrl = 'https://mbreciept.cbe.com.et/v2-Synthetic_42';
const telebirrSms = `Dear Synthetic Sender
You have transferred ETB 0.29 to Synthetic Merchant (25190****1234). Your transaction number is SYNTH1234. Receipt: ${telebirrUrl}.
Thank you for using telebirr`;
const cbeSms =
  'Dear Synthetic Sender You have successfully transferred ETB 42.50 from account 1********0001 to account 1********5678 (Synthetic CBE Merchant). Thanks for Banking with CBE.';
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
function evidence(url: string): Extract<ProviderResult, { kind: 'EVIDENCE' }> {
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
const cbeRetrieve = vi.fn(async (url: string): Promise<ProviderResult> => cbeEvidence(url));
function cbeEvidence(url: string): Extract<ProviderResult, { kind: 'EVIDENCE' }> {
  const receipt = evidence(url);
  return {
    ...receipt,
    evidence: {
      ...receipt.evidence,
      provider: 'cbe',
      transactionId: 'SYNTHETICCBE42',
      amountMinor: parseEtbAmount('42.50'),
      recipientName: 'Synthetic CBE Merchant',
      recipientAccountLast4: '5678',
      reference: 'SYNTHETIC_CBE42',
      paymentType: 'A2A',
    },
  };
}
let orders: Map<string, HostOrder>;
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
  return postEvidence({ receiptLocator, ...extra }, { token, key });
}
function postEvidence(
  payload: Record<string, unknown>,
  { token = 'alice', key = 'key-a', orderId = 'order-a' } = {},
) {
  return app.inject({
    method: 'POST',
    url: `/orders/${orderId}/receipt-verifications`,
    headers: headers(token, key),
    payload,
  });
}
beforeEach(async () => {
  database = new Database(':memory:');
  storage = sqliteStorage(database);
  await storage.migrate();
  retrieve.mockReset().mockImplementation(async (url) => evidence(url));
  cbeRetrieve.mockReset().mockImplementation(async (url) => cbeEvidence(url));
  orders = new Map([
    ['tenant-a/order-a', { orderId: 'order-a', ownerId: 'alice', expectation: snapshot() }],
    [
      'tenant-b/order-a',
      { orderId: 'order-a', ownerId: 'bob', expectation: snapshot('tenant-b', 'payment-b') },
    ],
    [
      'tenant-a/order-cbe',
      {
        orderId: 'order-cbe',
        ownerId: 'alice',
        expectation: createPaymentExpectation({
          ...snapshot('tenant-a', 'payment-cbe'),
          provider: 'cbe',
          amountMinor: parseEtbAmount('42.50'),
          recipientName: 'Synthetic CBE Merchant',
          recipientAccountLast4: '5678',
          reference: 'SYNTHETIC_CBE42',
        }),
      },
    ],
  ]);
  verifier = createReceiptVerifier({
    storage,
    providers: { telebirr: { retrieve }, cbe: { retrieve: cbeRetrieve } },
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
    readOrderState: async () => ({ fulfillmentStatus: 'PENDING' }),
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
    'amountPolicy',
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
  it('verifies a trusted snapshot and leaves fulfillment under host control', async () => {
    const response = await post();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      receipt: {
        tenantId: 'tenant-a',
        paymentId: 'payment-a',
        status: 'VERIFIED',
      },
    });
    expect(await storage.read(storageKey('claim', 'telebirr', 'SYNTH1234'))).toBeDefined();
    const order = await app.inject({ method: 'GET', url: '/orders/order-a', headers: headers() });
    expect(order.json()).toMatchObject({
      amountMinor: 29,
      fulfillmentStatus: 'PENDING',
    });
    expect((await post()).json()).toEqual(response.json());
    expect(retrieve).toHaveBeenCalledTimes(1);
  });
  it('replays exact inputs and rejects conflicting keys without returning another payment', async () => {
    const first = await post();
    expect((await post()).json()).toEqual(first.json());
    const conflict = await post('alice', 'key-a', 'OTHER1234');
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({
      error: { code: 'IDEMPOTENCY_CONFLICT' },
    });
    expect(retrieve).toHaveBeenCalledTimes(1);
  });
  it('coordinates receipt reuse across separately authenticated tenants', async () => {
    expect((await post()).json().receipt.status).toBe('VERIFIED');
    const other = await post('bob', 'key-b');
    expect(other.json()).toMatchObject({
      error: { code: 'RECEIPT_ALREADY_CLAIMED' },
    });
    expect(JSON.stringify(other.json())).not.toContain('tenant-a');
  });
  it('rejects changed host snapshots and keeps provider timeouts unclaimed', async () => {
    retrieve.mockResolvedValueOnce({
      kind: 'UNAVAILABLE',
      code: 'PROVIDER_TIMEOUT',
      stage: 'receipt_retrieval',
      retryable: true,
      details: { timeoutMs: 500 },
    });
    const response = await post();
    expect(response.json()).toMatchObject({
      receipt: { status: 'UNAVAILABLE' },
    });
    expect(await storage.read(storageKey('claim', 'telebirr', 'SYNTH1234'))).toBeUndefined();
    orders.set('tenant-a/order-a', {
      orderId: 'order-a',
      ownerId: 'alice',
      expectation: { ...snapshot(), amountMinor: parseEtbAmount('99') },
    });
    const changed = await post('alice', 'key-b');
    expect(changed.statusCode).toBe(409);
    expect(changed.json()).toMatchObject({ error: { code: 'EXPECTATION_CONFLICT' } });
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
    const response = await postEvidence({ receiptLocator: telebirrSms });
    expect(response.statusCode).toBe(202);
    const jobId = response.json().job.jobId as string;
    expect(response.json().job).toMatchObject({ state: 'QUEUED' });
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
        result: { status: 'VERIFIED' },
      },
    });
    expect(
      (await app.inject({ method: 'GET', url: '/orders/order-a', headers: headers() })).json(),
    ).toMatchObject({ fulfillmentStatus: 'PENDING' });
  });
});

describe('authenticated staging evidence', () => {
  it('normalizes all three Telebirr inputs to one attempt and rejects duplicate claims', async () => {
    const sms = `${telebirrSms.replace(` Receipt: ${telebirrUrl}.`, '')}\nPrivate SMS marker`;
    const first = await postEvidence({ receiptLocator: sms });
    expect(first.statusCode).toBe(200);
    expect(first.headers['cache-control']).toBe('no-store');
    expect(first.json()).toMatchObject({
      receipt: { status: 'VERIFIED' },
    });
    expect(retrieve.mock.calls.map(([url]) => url)).toEqual([telebirrUrl]);
    for (const input of [{ receiptLocator: 'synth1234' }, { receiptLocator: telebirrUrl }]) {
      expect((await postEvidence(input)).json()).toEqual(first.json());
    }
    expect(retrieve).toHaveBeenCalledTimes(1);
    const conflict = await postEvidence({ receiptLocator: 'OTHER1234' });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(retrieve).toHaveBeenCalledTimes(1);
    const reused = await postEvidence(
      { receiptLocator: telebirrUrl },
      { token: 'bob', key: 'key-b' },
    );
    expect(reused.json().error.code).toBe('RECEIPT_ALREADY_CLAIMED');
    expect(JSON.stringify(reused.json())).not.toContain('tenant-a');
    const attempt = await storage.read(storageKey('attempt', 'tenant-a', 'key-a'));
    expect(attempt).toBeDefined();
    expect(JSON.stringify(attempt)).not.toContain('Private SMS marker');
  });

  it('uses the CBE order method and verifies only the receipt link from SMS', async () => {
    const response = await postEvidence(
      {
        receiptLocator: `${cbeSms} ${cbeUrl}. for feedback: https://forms.gle/kGNGQpG3mQCCk3iD6`,
      },
      { orderId: 'order-cbe' },
    );
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      receipt: {
        paymentId: 'payment-cbe',
        status: 'VERIFIED',
        checks: expect.arrayContaining([
          expect.objectContaining({ field: 'amountMinor', status: 'PASS' }),
          expect.objectContaining({
            field: 'recipientAccount',
            rule: 'account_last4',
            status: 'PASS',
          }),
        ]),
      },
    });
    expect(retrieve).not.toHaveBeenCalled();
    expect(cbeRetrieve.mock.calls.map(([url]) => url)).toEqual([cbeUrl]);
    const order = await app.inject({
      method: 'GET',
      url: '/orders/order-cbe',
      headers: headers(),
    });
    expect(order.json()).toEqual({
      orderId: 'order-cbe',
      paymentId: 'payment-cbe',
      provider: 'cbe',
      amountMinor: 4250,
      currency: 'ETB',
      recipientName: 'Synthetic CBE Merchant',
      recipientAccount: null,
      invoiceReference: 'SYNTHETIC_CBE42',
      fulfillmentStatus: 'PENDING',
    });
  });

  it('accepts the bare CBE token and replays an equivalent CBE SMS without a link', async () => {
    const orderId = 'order-cbe';
    const first = await postEvidence({ receiptLocator: 'v2-Synthetic_42' }, { orderId });
    expect(first.json()).toMatchObject({
      receipt: { status: 'VERIFIED', receipt: { transactionId: 'SYNTHETICCBE42' } },
    });
    expect(
      (
        await postEvidence({ receiptLocator: `${cbeSms} Receipt ID: v2-Synthetic_42` }, { orderId })
      ).json(),
    ).toEqual(first.json());
    expect(cbeRetrieve).toHaveBeenCalledExactlyOnceWith(cbeUrl, undefined);
  });

  it.each([
    ['order-a', cbeUrl, 'PROVIDER_MISMATCH'],
    ['order-cbe', telebirrUrl, 'PROVIDER_MISMATCH'],
    ['order-cbe', cbeSms, 'UNRECOGNIZED_INPUT'],
    ['order-cbe', `${cbeSms} v2-Other ${cbeUrl}`, 'AMBIGUOUS_INPUT'],
    ['order-a', telebirrSms.replace('/SYNTH1234.', '/OTHER1234.'), 'AMBIGUOUS_INPUT'],
    ['order-cbe', 'https://mbreciept.cbe.com.et@wrong.invalid/v2-ABC', 'UNSUPPORTED_RECEIPT_URL'],
  ])('rejects conflicting or invalid evidence for %s', async (orderId, receiptLocator, code) => {
    const response = await postEvidence({ receiptLocator }, { orderId });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      receipt: { status: 'INVALID_INPUT', code, verificationId: null },
    });
    expect(await storage.read(storageKey('attempt', 'tenant-a', 'key-a'))).toBeUndefined();
    expect(retrieve).not.toHaveBeenCalled();
    expect(cbeRetrieve).not.toHaveBeenCalled();
  });

  it('rejects a second CBE token for an already claimed official transaction', async () => {
    const first = await postEvidence(
      { receiptLocator: 'v2-Synthetic_42' },
      { orderId: 'order-cbe' },
    );
    expect(first.json()).toMatchObject({ receipt: { status: 'VERIFIED' } });
    const priorOrder = orders.get('tenant-a/order-cbe')!;
    orders.set('tenant-a/order-cbe-2', {
      ...priorOrder,
      orderId: 'order-cbe-2',
      expectation: { ...priorOrder.expectation, paymentId: 'payment-cbe-2' },
    });
    const second = await postEvidence(
      { receiptLocator: 'v2-OtherToken' },
      { orderId: 'order-cbe-2', key: 'key-b' },
    );
    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ error: { code: 'RECEIPT_ALREADY_CLAIMED' } });
    expect(cbeRetrieve).toHaveBeenCalledTimes(2);
  });

  it('rejects the old typed request shape', async () => {
    const response = await postEvidence({ kind: 'sms', reference: telebirrSms });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'INVALID_REQUEST' });
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('compares independent receipt fields even when the SMS claims the right amount and recipient', async () => {
    const receipt = cbeEvidence(cbeUrl);
    cbeRetrieve.mockResolvedValueOnce({
      ...receipt,
      evidence: {
        ...receipt.evidence,
        amountMinor: parseEtbAmount('42.51'),
        recipientAccountLast4: '9999',
      },
    });
    const response = await postEvidence(
      { receiptLocator: `${cbeSms} ${cbeUrl}` },
      { orderId: 'order-cbe' },
    );
    expect(response.json()).toMatchObject({
      receipt: {
        status: 'MISMATCH',
        checks: expect.arrayContaining([
          expect.objectContaining({
            field: 'amountMinor',
            status: 'FAIL',
            code: 'AMOUNT_OVERPAID',
          }),
          expect.objectContaining({ field: 'recipientAccount', status: 'FAIL' }),
        ]),
      },
    });
    expect(await storage.read(storageKey('claim', 'cbe', 'SYNTHETICCBE42'))).toBeUndefined();
  });

  it('returns a provider timeout as unverified and uses a new key for a deliberate retry', async () => {
    retrieve.mockResolvedValueOnce({
      kind: 'UNAVAILABLE',
      code: 'PROVIDER_TIMEOUT',
      stage: 'receipt_retrieval',
      retryable: true,
      details: { timeoutMs: 500 },
    });
    const input = { receiptLocator: telebirrUrl };
    const timedOut = await postEvidence(input);
    expect(timedOut.statusCode).toBe(200);
    expect(timedOut.json()).toMatchObject({
      receipt: { status: 'UNAVAILABLE' },
    });
    expect(await storage.read(storageKey('claim', 'telebirr', 'SYNTH1234'))).toBeUndefined();
    expect((await postEvidence(input)).json()).toEqual(timedOut.json());
    expect(retrieve).toHaveBeenCalledTimes(1);
    expect((await postEvidence(input, { key: 'retry-a' })).json().receipt.status).toBe('VERIFIED');
    expect(retrieve).toHaveBeenCalledTimes(2);
  });

  it('blocks other customers and tenants before revealing the order provider or extracting evidence', async () => {
    const orderId = 'order-cbe';
    for (const [token, status] of [
      ['unknown', 401],
      ['mallory', 404],
      ['bob', 404],
    ] as const) {
      const response = await postEvidence({ receiptLocator: cbeSms }, { token, orderId });
      expect(response.statusCode).toBe(status);
      expect(response.json()).toEqual({ error: status === 401 ? 'UNAUTHENTICATED' : 'NOT_FOUND' });
      const order = await app.inject({
        method: 'GET',
        url: `/orders/${orderId}`,
        headers: headers(token),
      });
      expect(order.statusCode).toBe(status);
      expect(order.json()).toEqual(response.json());
    }
    expect(cbeRetrieve).not.toHaveBeenCalled();
    expect(
      await storage.read(storageKey('expectation', 'tenant-a', 'payment-cbe')),
    ).toBeUndefined();
  });
});
