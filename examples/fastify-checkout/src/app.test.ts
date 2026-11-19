import Database from 'better-sqlite3';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  createPaymentExpectation,
  createReceiptVerifier,
  parseEtbAmount,
  storageKey,
} from '@1hubengineering/verifier';
import type { ReceiptVerifier, SettlementStatus } from '@1hubengineering/verifier';
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
  settlement = 'UNCONFIRMED';
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
    const response = await postEvidence({ kind: 'sms', reference: telebirrSms });
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

describe('authenticated staging evidence', () => {
  it('normalizes all three Telebirr inputs to one attempt and rejects duplicate claims', async () => {
    const sms = `${telebirrSms.replace(` Receipt: ${telebirrUrl}.`, '')}\nPrivate SMS marker`;
    const first = await postEvidence({ kind: 'sms', reference: sms });
    expect(first.statusCode).toBe(200);
    expect(first.headers['cache-control']).toBe('no-store');
    expect(first.json()).toMatchObject({
      receipt: { verificationStatus: 'MATCHED_RECEIPT_ONLY', settlementStatus: 'UNCONFIRMED' },
    });
    expect(retrieve.mock.calls.map(([url]) => url)).toEqual([telebirrUrl]);
    for (const input of [
      { kind: 'transaction', reference: 'synth1234' },
      { kind: 'url', reference: telebirrUrl },
    ]) {
      expect((await postEvidence(input)).json()).toEqual(first.json());
    }
    expect(retrieve).toHaveBeenCalledTimes(1);
    const conflict = await postEvidence({ kind: 'transaction', reference: 'OTHER1234' });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().receipt.verificationStatus).toBe('IDEMPOTENCY_CONFLICT');
    expect(retrieve).toHaveBeenCalledTimes(1);
    const reused = await postEvidence(
      { kind: 'url', reference: telebirrUrl },
      { token: 'bob', key: 'key-b' },
    );
    expect(reused.json().receipt.verificationStatus).toBe('ALREADY_CLAIMED');
    expect(JSON.stringify(reused.json())).not.toContain('tenant-a');
    const attempt = await storage.read(storageKey('attempt', 'tenant-a', 'key-a'));
    expect(attempt).toBeDefined();
    expect(JSON.stringify(attempt)).not.toContain('Private SMS marker');
  });

  it('uses the CBE order method and verifies only the receipt link from SMS', async () => {
    const response = await postEvidence(
      {
        kind: 'sms',
        reference: `${cbeSms} ${cbeUrl}. for feedback: https://forms.gle/kGNGQpG3mQCCk3iD6`,
      },
      { orderId: 'order-cbe' },
    );
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      receipt: {
        paymentId: 'payment-cbe',
        verificationStatus: 'MATCHED_RECEIPT_ONLY',
        settlementStatus: 'UNCONFIRMED',
        checks: { amountMinor: 'PASS', recipientName: 'PASS', recipientAccountLast4: 'PASS' },
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
      settlementStatus: 'UNCONFIRMED',
      fulfillmentStatus: 'PENDING',
    });
  });

  it.each([
    { kind: 'transaction', reference: 'v2-Synthetic_42' },
    { kind: 'transaction', reference: 'BANKREF42' },
    { kind: 'sms', reference: cbeSms },
    { kind: 'sms', reference: `${cbeSms} https://forms.gle/kGNGQpG3mQCCk3iD6` },
  ])('asks for the official CBE link for $kind without consuming the key', async (input) => {
    const orderId = 'order-cbe';
    const response = await postEvidence(input, { orderId });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({
      error: 'CBE_RECEIPT_URL_REQUIRED',
      message: 'Paste the official CBE receipt URL.',
    });
    expect(
      await storage.read(storageKey('expectation', 'tenant-a', 'payment-cbe')),
    ).toBeUndefined();
    expect(await storage.read(storageKey('attempt', 'tenant-a', 'key-a'))).toBeUndefined();
    expect(cbeRetrieve).not.toHaveBeenCalled();
    const corrected = await postEvidence({ kind: 'url', reference: cbeUrl }, { orderId });
    expect(corrected.json().receipt.verificationStatus).toBe('MATCHED_RECEIPT_ONLY');
  });

  it.each([
    ['order-a', { kind: 'url', reference: cbeUrl }],
    ['order-cbe', { kind: 'url', reference: telebirrUrl }],
    ['order-a', { kind: 'sms', reference: cbeSms + ' Transaction ID: SYNTH1234' }],
    ['order-cbe', { kind: 'sms', reference: telebirrSms }],
    ['order-a', { kind: 'sms', reference: telebirrSms.replace('/SYNTH1234.', '/OTHER1234.') }],
    ['order-cbe', { kind: 'url', reference: 'https://mbreciept.cbe.com.et@wrong.invalid/v2-ABC' }],
    ['order-a', { kind: 'transaction', reference: 'Transaction ID: SYNTH1234' }],
    ['order-a', { kind: 'url', reference: 'Receipt ' + telebirrUrl }],
  ] as const)('refuses wrong-provider or invalid evidence for %s', async (orderId, input) => {
    const response = await postEvidence(input, { orderId });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'INVALID_EVIDENCE' });
    expect(retrieve).not.toHaveBeenCalled();
    expect(cbeRetrieve).not.toHaveBeenCalled();
  });

  it.each(['amountMinor', 'recipientName', 'recipientAccountLast4', 'provider', 'receiptLocator'])(
    'rejects %s on the typed request before verification',
    async (field) => {
      const response = await postEvidence({
        kind: 'sms',
        reference: telebirrSms,
        [field]: 'untrusted override',
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'INVALID_REQUEST' });
      expect(retrieve).not.toHaveBeenCalled();
    },
  );

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
      { kind: 'sms', reference: `${cbeSms} ${cbeUrl}` },
      { orderId: 'order-cbe' },
    );
    expect(response.json()).toMatchObject({
      receipt: {
        verificationStatus: 'MISMATCHED',
        settlementStatus: 'UNCONFIRMED',
        checks: { amountMinor: 'FAIL', recipientAccountLast4: 'FAIL' },
      },
    });
    expect(await storage.read(storageKey('claim', 'cbe', 'SYNTHETICCBE42'))).toBeUndefined();
  });

  it('returns a provider timeout as unverified and uses a new key for a deliberate retry', async () => {
    retrieve.mockResolvedValueOnce({ kind: 'UNAVAILABLE', code: 'TIMEOUT' });
    const input = { kind: 'url', reference: telebirrUrl };
    const timedOut = await postEvidence(input);
    expect(timedOut.statusCode).toBe(200);
    expect(timedOut.json()).toMatchObject({
      receipt: { verificationStatus: 'UNABLE_TO_VERIFY', settlementStatus: 'UNCONFIRMED' },
    });
    expect(await storage.read(storageKey('claim', 'telebirr', 'SYNTH1234'))).toBeUndefined();
    expect((await postEvidence(input)).json()).toEqual(timedOut.json());
    expect(retrieve).toHaveBeenCalledTimes(1);
    expect((await postEvidence(input, { key: 'retry-a' })).json().receipt.verificationStatus).toBe(
      'MATCHED_RECEIPT_ONLY',
    );
    expect(retrieve).toHaveBeenCalledTimes(2);
  });

  it('blocks other customers and tenants before revealing the order provider or extracting evidence', async () => {
    const orderId = 'order-cbe';
    for (const [token, status] of [
      ['unknown', 401],
      ['mallory', 404],
      ['bob', 404],
    ] as const) {
      const response = await postEvidence({ kind: 'sms', reference: cbeSms }, { token, orderId });
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
