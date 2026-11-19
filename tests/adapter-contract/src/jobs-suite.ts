import { expect, it, vi } from 'vite-plus/test';
import { createReceiptVerifier, storageKey, parseEtbAmount } from '@1hubengineering/verifier';
import type { VerificationStorage } from '@1hubengineering/verifier';
import { createDurableVerifier } from '@1hubengineering/verifier/jobs';
import type { JobPolicy } from '@1hubengineering/verifier/jobs';
import {
  expectation,
  providerResult,
  submission,
  time,
  jobTestKey,
  jobTestPolicy,
  timedOut,
} from './fixtures.ts';
import type { AdapterHarness } from './suite.ts';

export function jobContract(getHarness: () => AdapterHarness): void {
  const setup = async (policy: Partial<JobPolicy> = {}, supplied?: VerificationStorage) => {
    const harness = getHarness(),
      storage = supplied ?? harness.storage;
    let clock = time + 1000;
    const retrieve = vi.fn(async (url: string) => providerResult(url));
    const providers = { telebirr: { retrieve } };
    const verifier = createReceiptVerifier({ storage, providers, now: () => clock });
    const queue = (otherStorage = storage, key = jobTestKey) =>
      createDurableVerifier({
        storage: otherStorage,
        providers,
        encryptionKey: key,
        policy: { ...jobTestPolicy, ...policy },
        now: () => clock,
      });
    const jobs = queue();
    await jobs.initialize();
    await verifier.registerExpectation(expectation());
    return {
      harness,
      storage,
      retrieve,
      verifier,
      jobs,
      queue,
      tick: (amount = 4000) => {
        clock += amount;
      },
      clock: () => clock,
    };
  };
  it('durably accepts and deduplicates canonical locators without retrieval; scopes status and encrypts secrets', async () => {
    const { jobs, retrieve, storage } = await setup();
    const accepted = await jobs.enqueue(submission());
    expect(accepted).toMatchObject({
      state: 'QUEUED',
      attempts: 0,
    });
    expect(retrieve).not.toHaveBeenCalled();
    const replay = await jobs.enqueue(
      submission(
        'tenant-a',
        'payment-a',
        'another-key',
        'https://transactioninfo.ethiotelecom.et/receipt/SYNTH1234',
      ),
    );
    expect(replay).toEqual(accepted);
    await expect(
      jobs.enqueue(submission('tenant-a', 'payment-a', 'key-a', 'OTHER1234')),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await expect(
      jobs.status({ tenantId: 'tenant-b', paymentId: 'payment-a' }, accepted.jobId),
    ).rejects.toMatchObject({ code: 'JOB_NOT_FOUND' });
    await expect(
      jobs.status({ tenantId: 'tenant-a', paymentId: 'payment-b' }, accepted.jobId),
    ).rejects.toMatchObject({ code: 'JOB_NOT_FOUND' });
    const saved = JSON.stringify(await storage.transaction((tx) => tx.scan('rv1:job:', 10)));
    for (const secret of ['SYNTH1234', 'key-a', 'another-key', 'ethiotelecom'])
      expect(saved).not.toContain(secret);
    expect(JSON.stringify(accepted)).not.toMatch(/encrypted|aliases|snapshot|lease/);
    expect(await jobs.runOnce()).toBe('COMPLETED');
    expect((await jobs.status(submission(), accepted.jobId)).result?.status).toBe('VERIFIED');
  });
  it('bounds concurrent admission, pending/retained jobs and alias growth', async () => {
    const { jobs, verifier, retrieve, storage } = await setup({ maxPending: 1, maxRetained: 2 });
    const attempts = await Promise.allSettled(
      ['SYNTH1234', 'OTHER1234'].map((id) =>
        jobs.enqueue(submission('tenant-a', 'payment-a', id, id)),
      ),
    );
    expect(attempts.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const accepted = attempts.find((r) => r.status === 'fulfilled');
    if (!accepted || accepted.status !== 'fulfilled')
      throw new Error('Missing synthetic accepted job');
    const locator = (await storage.read(accepted.value.jobId)) as { aliases: string[] };
    expect(locator.aliases).toHaveLength(1);
    const successfulId = attempts[0]?.status === 'fulfilled' ? 'SYNTH1234' : 'OTHER1234';
    for (let i = 0; i < 7; i++)
      await jobs.enqueue(submission('tenant-a', 'payment-a', `alias-${i}`, successfulId));
    await expect(
      jobs.enqueue(submission('tenant-a', 'payment-a', 'excess-alias', successfulId)),
    ).rejects.toMatchObject({ code: 'QUEUE_CAPACITY' });
    expect(retrieve).not.toHaveBeenCalled();
    await jobs.runOnce();
    await verifier.registerExpectation(expectation('tenant-a', 'payment-b'));
    await jobs.enqueue(submission('tenant-a', 'payment-b', 'key-b', 'THIRD1234'));
    await jobs.runOnce();
    await verifier.registerExpectation(expectation('tenant-a', 'payment-c'));
    await expect(
      jobs.enqueue(submission('tenant-a', 'payment-c', 'key-c', 'FOURTH1234')),
    ).rejects.toMatchObject({ code: 'QUEUE_CAPACITY' });
  });
  it('rolls back unavailable attempts, retries after persisted backoff, and stops at the attempt bound', async () => {
    const { jobs, retrieve, verifier, storage, tick } = await setup();
    const accepted = await jobs.enqueue(submission());
    retrieve.mockResolvedValueOnce(timedOut);
    expect(await jobs.runOnce()).toBe('RETRY_WAIT');
    expect(await storage.read(storageKey('attempt', 'tenant-a', 'key-a'))).toBeUndefined();
    expect(await verifier.events()).toHaveLength(0);
    expect(await jobs.runOnce()).toBe('IDLE');
    tick();
    expect(await jobs.runOnce()).toBe('COMPLETED');
    expect(await jobs.status(submission(), accepted.jobId)).toMatchObject({
      state: 'COMPLETED',
      attempts: 2,
      result: { status: 'VERIFIED' },
    });
    await verifier.registerExpectation(expectation('tenant-a', 'payment-b'));
    const second = await jobs.enqueue(submission('tenant-a', 'payment-b', 'key-b', 'OTHER1234'));
    retrieve.mockResolvedValue(timedOut);
    expect(await jobs.runOnce()).toBe('RETRY_WAIT');
    tick();
    expect(await jobs.runOnce()).toBe('RETRY_WAIT');
    tick();
    expect(await jobs.runOnce()).toBe('COMPLETED');
    expect(await jobs.status(submission('tenant-a', 'payment-b'), second.jobId)).toMatchObject({
      attempts: 3,
      result: { status: 'UNAVAILABLE' },
    });
    expect(await jobs.runOnce()).toBe('IDLE');
    expect(await verifier.events()).toHaveLength(2);
  });
  it('replays coalesced aliases after pruning and allows a fresh key after a completed outcome', async () => {
    const { verifier, jobs, retrieve, clock, tick } = await setup();
    const original = submission();
    const alias = submission('tenant-a', 'payment-a', 'alias', 'Transaction ID: SYNTH1234');
    const accepted = await jobs.enqueue(original);
    expect(await jobs.enqueue(alias)).toEqual(accepted);
    await expect(verifier.submit(alias)).rejects.toMatchObject({ code: 'JOB_IN_PROGRESS' });
    retrieve.mockResolvedValueOnce({ kind: 'NOT_FOUND' });
    expect(await jobs.runOnce()).toBe('COMPLETED');
    const completed = await jobs.status(original, accepted.jobId);
    expect(completed.result?.status).toBe('NOT_FOUND');
    for (const event of await verifier.events()) await verifier.acknowledgeEvent(event.key);
    tick();
    expect(await jobs.pruneCompleted(clock())).toBe(1);
    expect(await jobs.enqueue(alias)).toEqual(completed);
    expect(await verifier.submit(alias)).toEqual(completed.result);
    const fresh = await jobs.enqueue(submission('tenant-a', 'payment-a', 'fresh'));
    expect(fresh.jobId).not.toBe(accepted.jobId);
    expect(fresh.state).toBe('QUEUED');
    expect(await jobs.runOnce()).toBe('COMPLETED');
    expect(retrieve).toHaveBeenCalledTimes(2);
  });
  it('completes invalid queued inputs without retrieving or storing the raw message', async () => {
    const { jobs, storage, retrieve } = await setup();
    const raw = 'Synthetic malformed message with no receipt';
    const job = await jobs.enqueue(submission('tenant-a', 'payment-a', 'key-a', raw));
    expect(job).toMatchObject({
      state: 'COMPLETED',
      attempts: 0,
      result: { status: 'INVALID_INPUT', code: 'UNRECOGNIZED_INPUT' },
    });
    expect(JSON.stringify(await storage.read(job.jobId))).not.toContain(raw);
    expect(retrieve).not.toHaveBeenCalled();
  });
  it('fences expired owners and recovers a lease through an independent adapter', async () => {
    const { jobs, queue, harness, retrieve, tick, verifier } = await setup();
    const accepted = await jobs.enqueue(submission());
    let release!: () => void, entered!: () => void;
    const begun = new Promise<void>((r) => {
      entered = r;
    });
    retrieve.mockImplementationOnce(async (url) => {
      entered();
      await new Promise<void>((r) => {
        release = r;
      });
      return providerResult(url);
    });
    const first = jobs.runOnce();
    await begun;
    expect(await jobs.runOnce()).toBe('BUSY');
    const other = queue(harness.fork());
    await other.initialize();
    expect(await other.runOnce()).toBe('IDLE');
    tick();
    expect(await other.runOnce()).toBe('COMPLETED');
    release();
    expect(await first).toBe('STALE');
    expect((await jobs.status(submission(), accepted.jobId)).attempts).toBe(2);
    expect(await verifier.events()).toHaveLength(1);
  });
  it('commits job completion with claim/result/outbox and recovers from injected final-write rollback', async () => {
    const harness = getHarness();
    let fail = false;
    const fault: VerificationStorage = {
      read: (key) => harness.storage.read(key),
      transaction: (work) =>
        harness.storage.transaction((tx) =>
          work({
            ...tx,
            async set(key, value) {
              if (
                fail &&
                key.startsWith('rv1:job:') &&
                (value as { state?: string }).state === 'COMPLETED'
              )
                throw new Error('synthetic terminal fault');
              return tx.set(key, value);
            },
          }),
        ),
    };
    const { jobs, queue, storage, verifier, tick } = await setup({}, fault);
    const accepted = await jobs.enqueue(submission());
    fail = true;
    await expect(jobs.runOnce()).rejects.toMatchObject({ code: 'STORAGE_FAILURE' });
    expect(await storage.read(storageKey('claim', 'telebirr', 'SYNTH1234'))).toBeUndefined();
    expect(await storage.read(storageKey('attempt', 'tenant-a', 'key-a'))).toBeUndefined();
    expect(await verifier.events()).toHaveLength(0);
    expect((await jobs.status(submission(), accepted.jobId)).state).toBe('RUNNING');
    fail = false;
    tick();
    expect(await queue(harness.fork()).runOnce()).toBe('COMPLETED');
    expect(await verifier.events()).toHaveLength(1);
  });
  it('fails closed on changed accepted snapshots and authenticated-ciphertext corruption', async () => {
    const { jobs, verifier, storage, retrieve } = await setup();
    const accepted = await jobs.enqueue(submission());
    await storage.transaction(async (tx) => {
      const key = storageKey('expectation', 'tenant-a', 'payment-a');
      await tx.set(key, {
        version: 2,
        expectation: { ...expectation(), amountMinor: parseEtbAmount('99') },
        state: 'OPEN',
      });
    });
    expect(await jobs.runOnce()).toBe('FAILED');
    expect((await jobs.status(submission(), accepted.jobId)).error?.code).toBe(
      'EXPECTATION_CHANGED',
    );
    expect(retrieve).not.toHaveBeenCalled();
    await verifier.registerExpectation(expectation('tenant-b', 'payment-b'));
    const damaged = await jobs.enqueue(submission('tenant-b', 'payment-b', 'key-b', 'OTHER1234'));
    await storage.transaction(async (tx) => {
      const job = (await tx.get(damaged.jobId)) as Record<string, unknown>;
      job.encrypted = 'AAAA';
      await tx.set(damaged.jobId, job);
    });
    expect(await jobs.runOnce()).toBe('FAILED');
    expect(
      (await jobs.status(submission('tenant-b', 'payment-b'), damaged.jobId)).error?.code,
    ).toBe('CORRUPT_STATE');
    expect(await storage.transaction((tx) => tx.scan('rv1:claim:', 10))).toHaveLength(0);
    expect(await verifier.events()).toHaveLength(2);
  });
  it('prunes only completed jobs with acknowledged events and preserves claims/results', async () => {
    const { jobs, queue, verifier, storage, tick, clock } = await setup({
      maxRetained: 1,
      maxPending: 1,
    });
    const accepted = await jobs.enqueue(submission());
    await jobs.runOnce();
    tick();
    expect(await jobs.pruneCompleted(clock())).toBe(0);
    for (const event of await verifier.events()) await verifier.acknowledgeEvent(event.key);
    expect(await jobs.pruneCompleted(clock())).toBe(1);
    await expect(jobs.status(submission(), accepted.jobId)).rejects.toMatchObject({
      code: 'JOB_NOT_FOUND',
    });
    expect(await storage.read(storageKey('claim', 'telebirr', 'SYNTH1234'))).toBeDefined();
    expect(await storage.read(storageKey('attempt', 'tenant-a', 'key-a'))).toBeDefined();
    await expect(queue(storage, new Uint8Array(32).fill(99)).initialize()).rejects.toMatchObject({
      code: 'QUEUE_CONFIGURATION',
    });
    await verifier.registerExpectation(expectation('tenant-a', 'payment-b'));
    await jobs.enqueue(submission('tenant-a', 'payment-b', 'key-b', 'OTHER1234'));
  });
  it('recovers an acknowledged job after SIGKILL and bounds repeated crashed attempts', async () => {
    const { jobs, harness, queue, retrieve, tick, clock, verifier } = await setup();
    const accepted = await jobs.enqueue(submission());
    await harness.crashJob(submission(), clock());
    expect(await jobs.status(submission(), accepted.jobId)).toMatchObject({
      state: 'RUNNING',
      attempts: 1,
    });
    expect(await verifier.events()).toHaveLength(0);
    tick();
    expect(await queue(harness.fork()).runOnce()).toBe('COMPLETED');
    expect((await jobs.status(submission(), accepted.jobId)).result?.status).toBe('VERIFIED');
    await verifier.registerExpectation(expectation('tenant-b', 'payment-b'));
    const input = submission('tenant-b', 'payment-b', 'key-b', 'OTHER1234');
    const repeated = await jobs.enqueue(input);
    for (let i = 0; i < 3; i++) {
      await harness.crashJob(input, clock());
      tick();
    }
    retrieve.mockClear();
    expect(await queue(harness.fork()).runOnce()).toBe('FAILED');
    expect(retrieve).not.toHaveBeenCalled();
    expect(await jobs.status(input, repeated.jobId)).toMatchObject({
      attempts: 3,
      error: { code: 'QUEUE_ATTEMPTS_EXHAUSTED' },
    });
    expect(await verifier.events()).toHaveLength(2);
  });
  it('rechecks cancellation and snapshot changes during retrieval before completing a job', async () => {
    const { jobs, verifier, storage, retrieve } = await setup();
    const cancelled = await jobs.enqueue(submission());
    await verifier.cancelExpectation(submission());
    expect(await jobs.runOnce()).toBe('FAILED');
    expect((await jobs.status(submission(), cancelled.jobId)).error?.code).toBe(
      'EXPECTATION_CANCELLED',
    );
    expect(retrieve).not.toHaveBeenCalled();
    await verifier.registerExpectation(expectation('tenant-b', 'payment-b'));
    const input = submission('tenant-b', 'payment-b', 'key-b', 'OTHER1234');
    const changed = await jobs.enqueue(input);
    retrieve.mockImplementationOnce(async (url) => {
      await storage.transaction((tx) =>
        tx.set(storageKey('expectation', 'tenant-b', 'payment-b'), {
          version: 2,
          expectation: { ...expectation('tenant-b', 'payment-b'), reference: 'CHANGED_1234' },
          state: 'OPEN',
        }),
      );
      return providerResult(url);
    });
    expect(await jobs.runOnce()).toBe('FAILED');
    expect((await jobs.status(input, changed.jobId)).error?.code).toBe('EXPECTATION_CHANGED');
    expect(await storage.transaction((tx) => tx.scan('rv1:claim:', 10))).toHaveLength(0);
  });
  it('persists a provider pause across workers after repeated unavailability', async () => {
    const { jobs, queue, harness, verifier, retrieve, tick } = await setup({ maxPending: 4 });
    retrieve.mockResolvedValue(timedOut);
    for (let i = 0; i < 3; i++) {
      await verifier.registerExpectation(expectation('tenant-a', `circuit-${i}`));
      await jobs.enqueue(submission('tenant-a', `circuit-${i}`, `key-${i}`, `SYNTH123${i}`));
      expect(await jobs.runOnce()).toBe('RETRY_WAIT');
    }
    await verifier.registerExpectation(expectation('tenant-a', 'circuit-new'));
    await jobs.enqueue(submission('tenant-a', 'circuit-new', 'key-new', 'FRESH1234'));
    const other = queue(harness.fork());
    await other.initialize();
    expect(await other.runOnce()).toBe('IDLE');
    expect(retrieve).toHaveBeenCalledTimes(3);
    tick();
    retrieve.mockImplementation(async (url) => providerResult(url));
    expect(await other.runOnce()).toBe('COMPLETED');
  });
  it('rejects inconsistent worker policy, wrong key and caller-owned queue acceptance', async () => {
    const { storage, jobs } = await setup();
    await jobs.enqueue(submission());
    for (const config of [
      { storage, encryptionKey: jobTestKey, policy: { ...jobTestPolicy, maxPending: 2 } },
      { storage, encryptionKey: new Uint8Array(32).fill(99), policy: jobTestPolicy },
    ])
      await expect(
        createDurableVerifier({ ...config, providers: {} }).initialize(),
      ).rejects.toMatchObject({ code: 'QUEUE_CONFIGURATION' });
    expect(() =>
      createDurableVerifier({
        storage: { ...storage, callerTransaction: true },
        encryptionKey: jobTestKey,
        providers: {},
      }),
    ).toThrow(expect.objectContaining({ code: 'QUEUE_CONFIGURATION' }));
    expect(() =>
      createDurableVerifier({
        storage,
        encryptionKey: jobTestKey,
        providers: {},
        policy: { timeoutMs: 3000, leaseMs: 3000 },
      }),
    ).toThrow(expect.objectContaining({ code: 'QUEUE_CONFIGURATION' }));
  });
}
