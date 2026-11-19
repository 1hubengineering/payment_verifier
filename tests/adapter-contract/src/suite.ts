import { expectation, providerResult, submission, time, timedOut } from './fixtures.ts';
import { jobContract } from './jobs-suite.ts';
import {
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { createReceiptVerifier, parseEtbAmount, storageKey } from '@1hubengineering/verifier';
import type {
  VerificationStorage,
  VerificationSubmission,
  VerificationResult,
  SerializedVerificationOperationError,
} from '@1hubengineering/verifier';
import type { ProviderResult } from '@1hubengineering/verifier/providers';

export type ProcessOutcome = VerificationResult | SerializedVerificationOperationError;

export interface AdapterHarness {
  storage: VerificationStorage;
  fork(): VerificationStorage;
  reset(): Promise<void>;
  migrate(): Promise<void>;
  incompatibleVersion(): Promise<void>;
  missingPrimaryKey(): Promise<void>;
  hostTransaction<T>(work: (storage: VerificationStorage) => Promise<T>): Promise<T>;
  assertOwnerOpen(): Promise<void>;
  restart(input: VerificationSubmission): Promise<ProcessOutcome>;
  race(inputs: readonly VerificationSubmission[]): Promise<readonly ProcessOutcome[]>;
  crashJob(input: VerificationSubmission, now: number): Promise<void>;
  close(): Promise<void>;
}

async function completeAll<T>(operations: readonly Promise<T>[]): Promise<T[]> {
  const results = await Promise.allSettled(operations);
  return results.map((result) => {
    if (result.status === 'rejected') throw result.reason;
    return result.value;
  });
}

export function adapterContract(name: string, createHarness: () => Promise<AdapterHarness>): void {
  describe(name, () => {
    let harness: AdapterHarness;
    const provider = {
      retrieve: vi.fn(async (url: string): Promise<ProviderResult> => providerResult(url)),
    };
    const verifier = (storage = harness.storage) =>
      createReceiptVerifier({ storage, providers: { telebirr: provider }, now: () => time + 1000 });
    beforeAll(async () => {
      harness = await createHarness();
      await harness.migrate();
    });
    beforeEach(async () => {
      await harness.reset();
      expect(await harness.storage.read(storageKey('jobcontrol', 'v2'))).toBeUndefined();
      provider.retrieve.mockReset().mockImplementation(async (url) => providerResult(url));
    });
    afterEach(async () => {
      await harness.assertOwnerOpen();
    });
    afterAll(async () => {
      await harness?.close();
    });

    jobContract(() => harness);

    it('migrates idempotently and refuses incompatible schema metadata', async () => {
      await harness.migrate();
      await harness.migrate();
      await harness.incompatibleVersion();
      await harness.missingPrimaryKey();
    });
    it('registers immutable expectations and keeps tenant lookups isolated', async () => {
      const v = verifier();
      await v.registerExpectation(expectation());
      await v.registerExpectation(expectation());
      await expect(
        v.registerExpectation({ ...expectation(), amountMinor: parseEtbAmount('2') }),
      ).rejects.toMatchObject({ code: 'EXPECTATION_CONFLICT' });
      await expect(v.submit(submission('other-tenant'))).rejects.toMatchObject({
        code: 'EXPECTATION_NOT_FOUND',
      });
      expect(provider.retrieve).not.toHaveBeenCalled();
    });
    it('commits one matched receipt, normalized evidence, result and durable event', async () => {
      const v = verifier();
      await v.registerExpectation(expectation());
      const result = await v.submit(submission());
      expect(result).toMatchObject({
        status: 'VERIFIED',
        verified: true,
      });
      expect(
        await harness.storage.read(storageKey('claim', 'telebirr', 'SYNTH1234')),
      ).toBeDefined();
      const saved = await harness.storage.read(storageKey('attempt', 'tenant-a', 'key-a'));
      expect(saved).toMatchObject({
        result: { receipt: { amountMinor: 29 }, source: { contentHash: 'a'.repeat(64) } },
      });
      expect(JSON.stringify(saved)).not.toContain('transactioninfo.ethiotelecom.et');
      const events = await v.events();
      expect(events).toHaveLength(1);
      await v.acknowledgeEvent(events[0]!.key);
      await v.acknowledgeEvent(events[0]!.key);
      expect(await v.events()).toHaveLength(0);
    });
    it('persists only bounded normalized evidence and never plugin extras or nested invalid values', async () => {
      const v = verifier();
      await v.registerExpectation(expectation());
      const first = providerResult('https://transactioninfo.ethiotelecom.et/receipt/SYNTH1234');
      if (first.kind !== 'EVIDENCE') throw new Error('Missing synthetic evidence');
      Object.assign(first.evidence, {
        rawHtml: 'synthetic-private-raw-extra',
        receiptUrl: 'synthetic-private-url-extra',
        unknown: { data: 'synthetic-private-extra' },
      });
      provider.retrieve.mockResolvedValueOnce(first);
      expect((await v.submit(submission())).status).toBe('VERIFIED');
      const saved = await harness.storage.read(storageKey('attempt', 'tenant-a', 'key-a'));
      expect(JSON.stringify(saved)).not.toContain('synthetic-private');
      await v.registerExpectation(expectation('tenant-a', 'payment-b'));
      const second = providerResult('https://transactioninfo.ethiotelecom.et/receipt/OTHER1234');
      if (second.kind !== 'EVIDENCE') throw new Error('Missing synthetic evidence');
      Object.assign(second.evidence, {
        recipientName: { rawHtml: 'synthetic-private-nested' },
        transactionAt: { raw: 'synthetic-private-timestamp' },
      });
      provider.retrieve.mockResolvedValueOnce(second);
      await expect(
        v.submit(submission('tenant-a', 'payment-b', 'key-b', 'OTHER1234')),
      ).rejects.toMatchObject({ code: 'INVALID_ADAPTER_RESULT' });
      expect(
        await harness.storage.read(storageKey('attempt', 'tenant-a', 'key-b')),
      ).toBeUndefined();
    });
    it('replays identical concurrent submissions with one claim and event', async () => {
      const v = verifier();
      await v.registerExpectation(expectation());
      const results = await completeAll(Array.from({ length: 6 }, () => v.submit(submission())));
      for (const result of results) expect(result).toEqual(results[0]);
      expect(results[0]!.status).toBe('VERIFIED');
      expect(await v.events()).toHaveLength(1);
      provider.retrieve.mockClear();
      expect(await v.submit(submission())).toEqual(results[0]);
      expect(provider.retrieve).not.toHaveBeenCalled();
    });
    it('rejects conflicting idempotency reuse without disclosing the original payment', async () => {
      const v = verifier();
      await v.registerExpectation(expectation());
      await v.registerExpectation(expectation('tenant-a', 'payment-b'));
      const first = await v.submit(submission());
      await expect(
        v.submit(submission('tenant-a', 'payment-b', 'key-a', 'OTHER1234')),
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
      expect(await v.submit(submission())).toEqual(first);
      expect(await v.events()).toHaveLength(1);
    });
    it('replays a tolerated payment and prevents claiming that receipt under another policy', async () => {
      const v = verifier();
      const tolerant = {
        ...expectation(),
        amountMinor: parseEtbAmount('0.30'),
        amountPolicy: { mode: 'tolerance', underpayment: { type: 'fixed', maxMinor: 1 } },
      } as const;
      await v.registerExpectation(tolerant);
      const result = await v.submit(submission());
      expect(result).toMatchObject({
        status: 'VERIFIED',
        receipt: { amountMinor: 29 },
        checks: expect.arrayContaining([
          expect.objectContaining({
            field: 'amountMinor',
            status: 'PASS',
            expected: 30,
            actual: 29,
            details: expect.objectContaining({ toleranceApplied: true, differenceMinor: -1 }),
          }),
        ]),
      });
      expect(
        await v.submit(submission('tenant-a', 'payment-a', 'key-a', 'Transaction ID: synth1234')),
      ).toEqual(result);
      await expect(
        v.registerExpectation({ ...tolerant, amountPolicy: { mode: 'exact' } }),
      ).rejects.toMatchObject({ code: 'EXPECTATION_CONFLICT' });
      await v.registerExpectation(expectation('tenant-b', 'payment-b'));
      await expect(v.submit(submission('tenant-b', 'payment-b'))).rejects.toMatchObject({
        code: 'RECEIPT_ALREADY_CLAIMED',
      });
      expect(await v.events()).toHaveLength(1);
    });
    it('rejects a legacy payload store without changing archived records', async () => {
      const key = storageKey('expectation', 'tenant-a', 'payment-a');
      const { amountPolicy: _amountPolicy, ...legacyExpectation } = expectation();
      const original = { expectation: legacyExpectation, state: 'RECEIPT_CLAIMED' };
      await harness.storage.transaction((tx) => tx.insert(key, original));
      await expect(verifier().initialize()).rejects.toMatchObject({ code: 'INCOMPATIBLE_STORE' });
      expect(await harness.storage.read(key)).toEqual(original);
    });
    it('distinguishes uncertain commit from rollback and recovers using the original key', async () => {
      const v = verifier();
      await v.registerExpectation(expectation());
      const prepared = await v.prepare(submission());
      const responseLost: VerificationStorage = {
        read: (key) => harness.storage.read(key),
        async transaction(work) {
          await harness.storage.transaction(work);
          throw new Error('Synthetic commit acknowledgment lost');
        },
      };
      await expect(v.complete(prepared, responseLost)).rejects.toMatchObject({
        code: 'STORAGE_OUTCOME_UNKNOWN',
        retryable: false,
      });
      const replayed = await v.submit(submission());
      expect(replayed.status).toBe('VERIFIED');
      expect(provider.retrieve).toHaveBeenCalledTimes(1);
      expect(await v.events()).toHaveLength(1);
    });
    it('keeps provider-confirmed absence separate from a missing expectation and caller cancellation', async () => {
      const v = verifier();
      await expect(v.submit(submission())).rejects.toMatchObject({ code: 'EXPECTATION_NOT_FOUND' });
      await v.registerExpectation(expectation());
      provider.retrieve.mockResolvedValueOnce({ kind: 'NOT_FOUND', details: { httpStatus: 404 } });
      const absent = await v.submit(submission());
      expect(absent).toMatchObject({
        status: 'NOT_FOUND',
        code: 'RECEIPT_NOT_FOUND',
        details: { httpStatus: 404 },
      });
      await expect(v.submit(submission(), { signal: AbortSignal.abort() })).rejects.toMatchObject({
        code: 'OPERATION_CANCELLED',
      });
      expect(provider.retrieve).toHaveBeenCalledTimes(1);
    });
    it('coordinates receipt claims globally across tenants and independent clients', async () => {
      const inputs = Array.from({ length: 6 }, (_, i) =>
        submission(`tenant-${i}`, `payment-${i}`, 'same-key'),
      );
      await completeAll(
        inputs.map((input) =>
          verifier().registerExpectation(expectation(input.tenantId, input.paymentId)),
        ),
      );
      const results = await Promise.allSettled(
        inputs.map((input) => verifier(harness.fork()).submit(input)),
      );
      expect(
        results.filter((r) => r.status === 'fulfilled' && r.value.status === 'VERIFIED'),
      ).toHaveLength(1);
      expect(
        results.filter(
          (r) => r.status === 'rejected' && r.reason?.code === 'RECEIPT_ALREADY_CLAIMED',
        ),
      ).toHaveLength(5);
      expect(await verifier().events()).toHaveLength(1);
    });
    it('allows only one receipt per payment under concurrent clients', async () => {
      const v = verifier();
      await v.registerExpectation(expectation());
      const inputs = ['SYNTH1234', 'OTHER1234'].map((id) =>
        submission('tenant-a', 'payment-a', id, id),
      );
      const results = await Promise.allSettled(
        inputs.map((input) => verifier(harness.fork()).submit(input)),
      );
      expect(
        results.filter((r) => r.status === 'fulfilled' && r.value.status === 'VERIFIED'),
      ).toHaveLength(1);
      expect(
        results.filter(
          (r) => r.status === 'rejected' && r.reason?.code === 'RECEIPT_ALREADY_CLAIMED',
        ),
      ).toHaveLength(1);
      const claims = await harness.storage.transaction((tx) => tx.scan('rv1:claim:', 10));
      expect(claims).toHaveLength(1);
    });
    it('uses case-sensitive keys even on case-insensitive database collations', async () => {
      const v = verifier();
      await v.registerExpectation(expectation());
      expect((await v.submit(submission('tenant-a', 'payment-a', 'Key-A'))).status).toBe(
        'VERIFIED',
      );
      await expect(v.submit(submission('tenant-a', 'payment-a', 'key-a'))).rejects.toMatchObject({
        code: 'RECEIPT_ALREADY_CLAIMED',
      });
      expect(await v.events()).toHaveLength(1);
    });
    it('retrieves outside transactions and snapshots evidence before completion', async () => {
      let inTransaction = false;
      const monitored: VerificationStorage = {
        read: (key) => harness.storage.read(key),
        transaction: (work) =>
          harness.storage.transaction(async (tx) => {
            inTransaction = true;
            try {
              return await work(tx);
            } finally {
              inTransaction = false;
            }
          }),
      };
      const v = verifier(monitored);
      await v.registerExpectation(expectation());
      let evidence: ProviderResult | undefined;
      provider.retrieve.mockImplementation(async (url) => {
        expect(inTransaction).toBe(false);
        evidence = providerResult(url);
        return evidence;
      });
      const prepared = await v.prepare(submission());
      if (evidence?.kind === 'EVIDENCE') Object.assign(evidence.evidence, { amountMinor: 999 });
      expect((await v.complete(prepared)).status).toBe('VERIFIED');
      await expect(v.complete({} as Parameters<typeof v.complete>[0])).rejects.toMatchObject({
        code: 'INVALID_PREPARATION',
      });
    });
    it('rolls back claims, state, evidence, result and event on a mid-write failure', async () => {
      const v = verifier();
      await v.registerExpectation(expectation());
      const prepared = await v.prepare(submission());
      const fault: VerificationStorage = {
        read: (key) => harness.storage.read(key),
        transaction: (work) =>
          harness.storage.transaction((tx) =>
            work({
              ...tx,
              async insert(key, value) {
                if (key.startsWith('rv1:event:')) throw new Error('synthetic failure');
                await tx.insert(key, value);
              },
            }),
          ),
      };
      await expect(v.complete(prepared, fault)).rejects.toMatchObject({ code: 'STORAGE_FAILURE' });
      expect(
        await harness.storage.read(storageKey('claim', 'telebirr', 'SYNTH1234')),
      ).toBeUndefined();
      expect(
        await harness.storage.read(storageKey('attempt', 'tenant-a', 'key-a')),
      ).toBeUndefined();
      expect(await v.events()).toHaveLength(0);
      expect((await v.submit(submission())).status).toBe('VERIFIED');
    });
    it('joins the actual host transaction and follows its rollback and commit', async () => {
      const v = verifier();
      await v.registerExpectation(expectation());
      const prepared = await v.prepare(submission());
      const hostKey = storageKey('host', 'synthetic-business-record');
      await expect(
        harness.hostTransaction(async (scoped) => {
          await expect(verifier(scoped).prepare(submission())).rejects.toMatchObject({
            code: 'INVALID_REQUEST',
          });
          expect((await v.complete(prepared, scoped)).status).toBe('VERIFIED');
          await scoped.transaction((tx) => tx.insert(hostKey, { synthetic: true }));
          throw new Error('host rollback');
        }),
      ).rejects.toThrow('host rollback');
      expect(await harness.storage.read(hostKey)).toBeUndefined();
      expect(await v.events()).toHaveLength(0);
      await harness.hostTransaction(async (scoped) => {
        await v.complete(prepared, scoped);
        await scoped.transaction((tx) => tx.insert(hostKey, { synthetic: true }));
      });
      expect(await harness.storage.read(hostKey)).toEqual({ synthetic: true });
      expect(await v.events()).toHaveLength(1);
    });
    it('rechecks cancellation and expiration after retrieval, before claiming', async () => {
      let now = time + 1000;
      const v = createReceiptVerifier({
        storage: harness.storage,
        providers: { telebirr: provider },
        now: () => now,
      });
      await v.registerExpectation(expectation());
      const prepared = await v.prepare(submission());
      await v.cancelExpectation(expectation());
      await expect(v.complete(prepared)).rejects.toMatchObject({ code: 'EXPECTATION_CANCELLED' });
      await v.registerExpectation(expectation('tenant-a', 'payment-b'));
      const expiring = await v.prepare(submission('tenant-a', 'payment-b', 'key-b'));
      now = time + 60_001;
      await expect(v.complete(expiring)).rejects.toMatchObject({ code: 'EXPECTATION_EXPIRED' });
      expect(
        await harness.storage.read(storageKey('claim', 'telebirr', 'SYNTH1234')),
      ).toBeUndefined();
    });
    it('keeps provider timeouts and missing or fabricated evidence unclaimed', async () => {
      const v = verifier();
      await v.registerExpectation(expectation());
      provider.retrieve.mockResolvedValueOnce(timedOut);
      expect((await v.submit(submission())).status).toBe('UNAVAILABLE');
      const p = providerResult('https://transactioninfo.ethiotelecom.et/receipt/SYNTH1234');
      if (p.kind === 'EVIDENCE') Object.assign(p.provenance, { kind: 'SAVED_HTML' });
      provider.retrieve.mockResolvedValueOnce(p);
      await expect(v.submit(submission('tenant-a', 'payment-a', 'key-b'))).rejects.toMatchObject({
        code: 'INVALID_ADAPTER_RESULT',
      });
      expect(
        await harness.storage.read(storageKey('claim', 'telebirr', 'SYNTH1234')),
      ).toBeUndefined();
    });
    it('recovers an acknowledged commit after response loss and a fresh process', async () => {
      const v = verifier();
      await v.registerExpectation(expectation());
      const committed = await v.submit(submission());
      expect(await harness.restart(submission())).toEqual(committed);
      expect(await v.events()).toHaveLength(1);
    });
    it('arbitrates simultaneous independent processes at the commit boundary', async () => {
      const inputs = [submission(), submission('tenant-b', 'payment-b', 'key-b')];
      for (const input of inputs)
        await verifier().registerExpectation(expectation(input.tenantId, input.paymentId));
      const results = await harness.race(inputs);
      expect(results.filter((r) => 'status' in r && r.status === 'VERIFIED')).toHaveLength(1);
      expect(results.filter((r) => r.code === 'RECEIPT_ALREADY_CLAIMED')).toHaveLength(1);
      expect(await verifier().events()).toHaveLength(1);
    });
  });
}
