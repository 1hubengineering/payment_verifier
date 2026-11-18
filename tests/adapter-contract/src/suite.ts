import { expectation, providerResult, submission, time } from './fixtures.ts';
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
import {
  createReceiptVerifier,
  parseEtbAmount,
  storageKey,
} from '@1hubengineering/receipt-verifier';
import type {
  VerificationStorage,
  VerificationSubmission,
  VerificationResult,
} from '@1hubengineering/receipt-verifier';
import type { ProviderResult } from '@1hubengineering/receipt-verifier/providers';

export interface AdapterHarness {
  storage: VerificationStorage;
  fork(): VerificationStorage;
  reset(): Promise<void>;
  migrate(): Promise<void>;
  incompatibleVersion(): Promise<void>;
  missingPrimaryKey(): Promise<void>;
  hostTransaction<T>(work: (storage: VerificationStorage) => Promise<T>): Promise<T>;
  assertOwnerOpen(): Promise<void>;
  restart(input: VerificationSubmission): Promise<VerificationResult>;
  race(inputs: readonly VerificationSubmission[]): Promise<readonly VerificationResult[]>;
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
      ).rejects.toMatchObject({ code: 'EXPECTATION_EXISTS' });
      await expect(v.submit(submission('other-tenant'))).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      expect(provider.retrieve).not.toHaveBeenCalled();
    });
    it('commits one matched receipt, normalized evidence, result and durable event', async () => {
      const v = verifier();
      await v.registerExpectation(expectation());
      const result = await v.submit(submission());
      expect(result).toMatchObject({
        verificationStatus: 'MATCHED_RECEIPT_ONLY',
        settlementStatus: 'UNCONFIRMED',
      });
      expect(
        await harness.storage.read(storageKey('claim', 'telebirr', 'SYNTH1234')),
      ).toBeDefined();
      const saved = await harness.storage.read(storageKey('attempt', 'tenant-a', 'key-a'));
      expect(saved).toMatchObject({
        evidence: { amountMinor: 29 },
        provenance: { sha256: 'a'.repeat(64) },
      });
      expect(JSON.stringify(saved)).not.toContain('transactioninfo.ethiotelecom.et');
      const events = await v.events();
      expect(events).toHaveLength(1);
      await v.acknowledgeEvent(events[0]!.key);
      await v.acknowledgeEvent(events[0]!.key);
      expect(await v.events()).toHaveLength(0);
    });
    it('replays identical concurrent submissions with one claim and event', async () => {
      const v = verifier();
      await v.registerExpectation(expectation());
      const results = await completeAll(Array.from({ length: 6 }, () => v.submit(submission())));
      for (const result of results) expect(result).toEqual(results[0]);
      expect(results[0]!.verificationStatus).toBe('MATCHED_RECEIPT_ONLY');
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
      const conflict = await v.submit(submission('tenant-a', 'payment-b', 'key-a', 'OTHER1234'));
      expect(conflict).toMatchObject({
        paymentId: 'payment-b',
        verificationStatus: 'IDEMPOTENCY_CONFLICT',
        checks: {},
      });
      expect(await v.submit(submission())).toEqual(first);
      expect(await v.events()).toHaveLength(1);
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
      const results = await completeAll(
        inputs.map((input) => verifier(harness.fork()).submit(input)),
      );
      expect(results.filter((r) => r.verificationStatus === 'MATCHED_RECEIPT_ONLY')).toHaveLength(
        1,
      );
      expect(results.filter((r) => r.verificationStatus === 'ALREADY_CLAIMED')).toHaveLength(5);
      expect(results.every((r) => !('claimedBy' in r))).toBe(true);
      expect(await verifier().events()).toHaveLength(6);
    });
    it('allows only one receipt per payment under concurrent clients', async () => {
      const v = verifier();
      await v.registerExpectation(expectation());
      const inputs = ['SYNTH1234', 'OTHER1234'].map((id) =>
        submission('tenant-a', 'payment-a', id, id),
      );
      const results = await completeAll(
        inputs.map((input) => verifier(harness.fork()).submit(input)),
      );
      expect(results.filter((r) => r.verificationStatus === 'MATCHED_RECEIPT_ONLY')).toHaveLength(
        1,
      );
      expect(results.filter((r) => r.verificationStatus === 'ALREADY_CLAIMED')).toHaveLength(1);
      const claims = await harness.storage.transaction((tx) => tx.scan('rv1:claim:', 10));
      expect(claims).toHaveLength(1);
    });
    it('uses case-sensitive keys even on case-insensitive database collations', async () => {
      const v = verifier();
      await v.registerExpectation(expectation());
      expect(
        (await v.submit(submission('tenant-a', 'payment-a', 'Key-A'))).verificationStatus,
      ).toBe('MATCHED_RECEIPT_ONLY');
      expect(
        (await v.submit(submission('tenant-a', 'payment-a', 'key-a'))).verificationStatus,
      ).toBe('ALREADY_CLAIMED');
      expect(await v.events()).toHaveLength(2);
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
      expect((await v.complete(prepared)).verificationStatus).toBe('MATCHED_RECEIPT_ONLY');
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
      await expect(v.complete(prepared, fault)).rejects.toThrow('synthetic failure');
      expect(
        await harness.storage.read(storageKey('claim', 'telebirr', 'SYNTH1234')),
      ).toBeUndefined();
      expect(
        await harness.storage.read(storageKey('attempt', 'tenant-a', 'key-a')),
      ).toBeUndefined();
      expect(await v.events()).toHaveLength(0);
      expect((await v.submit(submission())).verificationStatus).toBe('MATCHED_RECEIPT_ONLY');
    });
    it('joins the actual host transaction and follows its rollback and commit', async () => {
      const v = verifier();
      await v.registerExpectation(expectation());
      const prepared = await v.prepare(submission());
      const hostKey = storageKey('host', 'synthetic-business-record');
      await expect(
        harness.hostTransaction(async (scoped) => {
          await expect(verifier(scoped).prepare(submission())).rejects.toMatchObject({
            code: 'INVALID_INPUT',
          });
          expect((await v.complete(prepared, scoped)).verificationStatus).toBe(
            'MATCHED_RECEIPT_ONLY',
          );
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
      const v = verifier();
      await v.registerExpectation(expectation());
      const prepared = await v.prepare(submission());
      await v.cancelExpectation(expectation());
      expect((await v.complete(prepared)).verificationStatus).toBe('CANCELLED');
      await v.registerExpectation(expectation('tenant-a', 'payment-b'));
      const expiring = await v.prepare(submission('tenant-a', 'payment-b', 'key-b'));
      const expired = createReceiptVerifier({
        storage: harness.storage,
        providers: { telebirr: provider },
        now: () => time + 60_001,
      });
      expect((await expired.complete(expiring)).verificationStatus).toBe('EXPIRED');
      expect(
        await harness.storage.read(storageKey('claim', 'telebirr', 'SYNTH1234')),
      ).toBeUndefined();
    });
    it('keeps provider timeouts and missing or fabricated evidence unclaimed', async () => {
      const v = verifier();
      await v.registerExpectation(expectation());
      provider.retrieve.mockResolvedValueOnce({ kind: 'UNAVAILABLE', code: 'TIMEOUT' });
      expect((await v.submit(submission())).verificationStatus).toBe('UNABLE_TO_VERIFY');
      const p = providerResult('https://transactioninfo.ethiotelecom.et/receipt/SYNTH1234');
      if (p.kind === 'EVIDENCE') Object.assign(p.provenance, { kind: 'SAVED_HTML' });
      provider.retrieve.mockResolvedValueOnce(p);
      expect(
        (await v.submit(submission('tenant-a', 'payment-a', 'key-b'))).verificationStatus,
      ).toBe('UNABLE_TO_VERIFY');
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
      expect(results.filter((r) => r.verificationStatus === 'MATCHED_RECEIPT_ONLY')).toHaveLength(
        1,
      );
      expect(results.filter((r) => r.verificationStatus === 'ALREADY_CLAIMED')).toHaveLength(1);
      expect(await verifier().events()).toHaveLength(2);
    });
  });
}
