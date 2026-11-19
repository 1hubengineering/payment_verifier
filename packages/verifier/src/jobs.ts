import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from 'node:crypto';
import { createPaymentExpectation } from './comparison.ts';
import type { PaymentExpectation } from './comparison.ts';
import { createReceiptVerifier, storageKey } from './verifier.ts';
import type {
  PaymentScope,
  ReceiptProvider,
  VerificationSubmission,
  VerificationResult,
} from './verifier.ts';
import type { RecordTransaction, VerificationStorage } from './storage.ts';
import type { ProviderId } from './types.ts';
import { normalizeReceiptLocator } from './providers/locator.ts';

export interface JobPolicy {
  readonly maxPending: number;
  readonly maxRetained: number;
  readonly concurrency: number;
  readonly maxAttempts: number;
  readonly timeoutMs: number;
  readonly leaseMs: number;
  readonly backoffMs: number;
}
export interface VerificationJob extends PaymentScope {
  readonly jobId: string;
  readonly state: 'QUEUED' | 'RUNNING' | 'RETRY_WAIT' | 'COMPLETED';
  readonly attempts: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly nextRunAt: number;
  readonly settlementStatus: 'UNCONFIRMED';
  readonly result?: VerificationResult;
}
export interface DurableVerifier {
  initialize(): Promise<void>;
  enqueue(input: VerificationSubmission): Promise<VerificationJob>;
  status(scope: PaymentScope, jobId: string): Promise<VerificationJob>;
  runOnce(options?: {
    readonly signal?: AbortSignal;
  }): Promise<'IDLE' | 'BUSY' | 'STALE' | 'RETRY_WAIT' | 'COMPLETED'>;
  pruneCompleted(before: number, limit?: number): Promise<number>;
}
export class JobError extends Error {
  constructor(
    readonly code:
      | 'INVALID_INPUT'
      | 'NOT_FOUND'
      | 'NOT_OPEN'
      | 'IDEMPOTENCY_CONFLICT'
      | 'CAPACITY'
      | 'CONFIGURATION'
      | 'CORRUPT_STATE',
  ) {
    super(code);
    this.name = 'JobError';
  }
}
interface Circuit {
  failures: number;
  until: number;
}
interface Control {
  signature: string;
  pending: number;
  retained: number;
  revision: number;
  circuits: Record<ProviderId, Circuit>;
}
type JobRecord = { -readonly [K in keyof VerificationJob]: VerificationJob[K] } & {
  provider: ProviderId;
  snapshot: string;
  encrypted: string;
  aliases: string[];
  lease: string;
  leaseUntil: number;
  eventKey?: string;
  history: {
    startedAt: number;
    finishedAt?: number;
    outcome?: 'UNAVAILABLE' | 'COMPLETED' | 'LEASE_EXPIRED';
  }[];
};
const controlKey = storageKey('jobcontrol', 'v1');
function identifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= 128 &&
    value.trim() === value &&
    Array.from(value).every((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)
  );
}
function scope(value: PaymentScope): void {
  if (!identifier(value?.tenantId) || !identifier(value?.paymentId))
    throw new JobError('INVALID_INPUT');
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new JobError('CORRUPT_STATE');
  return value as Record<string, unknown>;
}
function snapshot(
  value: unknown,
  expected: PaymentScope,
): { expectation: PaymentExpectation; state: string; digest: string } {
  const record = object(value);
  let expectation: PaymentExpectation;
  try {
    expectation = createPaymentExpectation(record.expectation);
  } catch {
    throw new JobError('CORRUPT_STATE');
  }
  if (
    expectation.tenantId !== expected.tenantId ||
    expectation.paymentId !== expected.paymentId ||
    !['OPEN', 'CANCELLED', 'RECEIPT_CLAIMED'].includes(record.state as string)
  )
    throw new JobError('CORRUPT_STATE');
  return {
    expectation,
    state: record.state as string,
    digest: createHash('sha256').update(JSON.stringify(expectation)).digest('hex'),
  };
}
function jobRecord(value: unknown): JobRecord {
  const record = object(value);
  if (
    typeof record.jobId !== 'string' ||
    !/^rv1:job:[a-f0-9]{64}$/u.test(record.jobId) ||
    !identifier(record.tenantId) ||
    !identifier(record.paymentId) ||
    !['QUEUED', 'RUNNING', 'RETRY_WAIT', 'COMPLETED'].includes(record.state as string) ||
    record.settlementStatus !== 'UNCONFIRMED' ||
    !['telebirr', 'cbe'].includes(record.provider as string) ||
    typeof record.snapshot !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(record.snapshot) ||
    typeof record.encrypted !== 'string' ||
    record.encrypted.length > 12000 ||
    !Array.isArray(record.aliases) ||
    record.aliases.length < 1 ||
    record.aliases.length > 8 ||
    record.aliases.some((a) => typeof a !== 'string' || !/^rv1:jobalias:[a-f0-9]{64}$/u.test(a)) ||
    typeof record.lease !== 'string' ||
    !Array.isArray(record.history) ||
    record.history.length > 10 ||
    ['attempts', 'createdAt', 'updatedAt', 'nextRunAt', 'leaseUntil'].some(
      (k) => !Number.isSafeInteger(record[k]) || (record[k] as number) < 0,
    ) ||
    (record.attempts as number) > 10 ||
    (record.state === 'COMPLETED' && (!record.result || typeof record.eventKey !== 'string'))
  )
    throw new JobError('CORRUPT_STATE');
  if (record.state === 'COMPLETED') {
    const result = object(record.result),
      checks = object(result.checks);
    if (
      result.tenantId !== record.tenantId ||
      result.paymentId !== record.paymentId ||
      result.settlementStatus !== 'UNCONFIRMED' ||
      typeof result.verificationId !== 'string' ||
      record.eventKey !== storageKey('event', result.verificationId) ||
      ![
        'MATCHED_RECEIPT_ONLY',
        'MISMATCHED',
        'UNABLE_TO_VERIFY',
        'ALREADY_CLAIMED',
        'CANCELLED',
        'EXPIRED',
        'NEEDS_REVIEW',
        'IDEMPOTENCY_CONFLICT',
      ].includes(result.verificationStatus as string) ||
      Object.values(checks).some(
        (c) => !['PASS', 'FAIL', 'MISSING', 'INVALID', 'AMBIGUOUS'].includes(c as string),
      )
    )
      throw new JobError('CORRUPT_STATE');
  }
  return record as unknown as JobRecord;
}
function publicJob(job: JobRecord): VerificationJob {
  return {
    tenantId: job.tenantId,
    paymentId: job.paymentId,
    jobId: job.jobId,
    state: job.state,
    attempts: job.attempts,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    nextRunAt: job.nextRunAt,
    settlementStatus: 'UNCONFIRMED',
    ...(job.result ? { result: structuredClone(job.result) } : {}),
  };
}
class RetryUnavailable extends Error {}

/** No work starts at import or construction. Hosts supply durable storage and a 32-byte secret. */
export function createDurableVerifier(config: {
  readonly storage: VerificationStorage;
  readonly providers: Readonly<Partial<Record<ProviderId, ReceiptProvider>>>;
  readonly encryptionKey: Uint8Array;
  readonly policy?: Partial<JobPolicy>;
  readonly now?: () => number;
}): DurableVerifier {
  if (
    config.storage.callerTransaction ||
    !(config.encryptionKey instanceof Uint8Array) ||
    config.encryptionKey.length !== 32
  )
    throw new JobError('CONFIGURATION');
  const storage = config.storage,
    secret = Buffer.from(config.encryptionKey);
  const policy: JobPolicy = {
    maxPending: 100,
    maxRetained: 1000,
    concurrency: 1,
    maxAttempts: 3,
    timeoutMs: 15000,
    leaseMs: 30000,
    backoffMs: 1000,
    ...config.policy,
  };
  if (
    Object.values(policy).some((v) => !Number.isSafeInteger(v) || v < 1) ||
    policy.maxRetained > 1000 ||
    policy.maxPending > policy.maxRetained ||
    policy.concurrency > 4 ||
    policy.maxAttempts > 10 ||
    policy.timeoutMs > 60000 ||
    policy.leaseMs < policy.timeoutMs + 1000 ||
    policy.leaseMs > 300000 ||
    policy.backoffMs > 60000
  )
    throw new JobError('CONFIGURATION');
  const signature = createHash('sha256')
    .update(secret)
    .update(JSON.stringify(policy))
    .digest('hex');
  const now = (): number => {
    const time = (config.now ?? Date.now)();
    if (!Number.isSafeInteger(time) || time < 0 || time > Number.MAX_SAFE_INTEGER - 1_000_000)
      throw new JobError('INVALID_INPUT');
    return time;
  };
  const verifier = createReceiptVerifier({ storage, providers: config.providers, now });
  const unavailableVerifier = createReceiptVerifier({ storage, providers: {}, now });
  let active = 0;
  const control = async (tx: RecordTransaction): Promise<Control> => {
    const value = object(await tx.get(controlKey));
    if (value.signature !== signature) throw new JobError('CONFIGURATION');
    if (
      ['pending', 'retained', 'revision'].some(
        (k) => !Number.isSafeInteger(value[k]) || (value[k] as number) < 0,
      ) ||
      (value.pending as number) > (value.retained as number) ||
      (value.retained as number) > policy.maxRetained
    )
      throw new JobError('CORRUPT_STATE');
    for (const provider of ['telebirr', 'cbe']) {
      const c = object(object(value.circuits)[provider]);
      if (
        !Number.isSafeInteger(c.failures) ||
        !Number.isSafeInteger(c.until) ||
        (c.failures as number) < 0 ||
        (c.until as number) < 0
      )
        throw new JobError('CORRUPT_STATE');
    }
    const result = value as unknown as Control;
    result.revision++;
    await tx.set(controlKey, result);
    return result;
  };
  const encrypt = (
    job: Pick<JobRecord, 'jobId' | 'snapshot'>,
    input: VerificationSubmission,
  ): string => {
    const nonce = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', secret, nonce);
    cipher.setAAD(Buffer.from(JSON.stringify([job.jobId, job.snapshot])));
    const body = Buffer.concat([
      cipher.update(
        JSON.stringify({
          idempotencyKey: input.idempotencyKey,
          receiptLocator: input.receiptLocator,
        }),
        'utf8',
      ),
      cipher.final(),
    ]);
    return Buffer.concat([nonce, cipher.getAuthTag(), body]).toString('base64');
  };
  const decrypt = (job: JobRecord): VerificationSubmission => {
    const bytes = Buffer.from(job.encrypted, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', secret, bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(JSON.stringify([job.jobId, job.snapshot])));
    decipher.setAuthTag(bytes.subarray(12, 28));
    const decoded = object(
      JSON.parse(
        Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'),
      ),
    );
    if (!identifier(decoded.idempotencyKey) || typeof decoded.receiptLocator !== 'string')
      throw new JobError('CORRUPT_STATE');
    const locator = normalizeReceiptLocator(job.provider, decoded.receiptLocator);
    if (storageKey('job', job.tenantId, job.paymentId, locator.url) !== job.jobId)
      throw new JobError('CORRUPT_STATE');
    return {
      tenantId: job.tenantId,
      paymentId: job.paymentId,
      idempotencyKey: decoded.idempotencyKey,
      receiptLocator: locator.url,
    };
  };
  const matchesLease = (current: JobRecord, held: JobRecord): boolean =>
    current.state === 'RUNNING' && current.lease === held.lease && current.leaseUntil > now();
  const finish = async (
    tx: RecordTransaction,
    c: Control,
    job: JobRecord,
    result: VerificationResult,
    eventKey: string,
  ): Promise<void> => {
    job.state = 'COMPLETED';
    job.updatedAt = now();
    job.nextRunAt = 0;
    job.leaseUntil = 0;
    job.lease = '';
    job.encrypted = '';
    job.result = result;
    job.eventKey = eventKey;
    const history = job.history.at(-1);
    if (history) {
      history.finishedAt = job.updatedAt;
      history.outcome = 'COMPLETED';
    }
    c.pending--;
    if (
      result.verificationStatus === 'UNABLE_TO_VERIFY' &&
      Object.keys(result.checks).length === 0
    ) {
      const circuit = c.circuits[job.provider];
      circuit.failures = Math.min(1000, circuit.failures + 1);
      if (circuit.failures >= 3)
        circuit.until = now() + Math.min(60000, policy.backoffMs * 2 ** (job.attempts - 1));
    } else if (Object.keys(result.checks).length > 0)
      c.circuits[job.provider] = { failures: 0, until: 0 };
    await tx.set(controlKey, c);
    await tx.set(job.jobId, job);
  };
  const review = async (held: JobRecord): Promise<'STALE' | 'COMPLETED'> =>
    storage.transaction(async (tx) => {
      const c = await control(tx),
        current = jobRecord(await tx.get(held.jobId));
      if (!matchesLease(current, held)) return 'STALE';
      const result: VerificationResult = {
        tenantId: current.tenantId,
        paymentId: current.paymentId,
        verificationId: storageKey('jobresult', current.jobId),
        verificationStatus: 'NEEDS_REVIEW',
        settlementStatus: 'UNCONFIRMED',
        checks: {},
      };
      const eventKey = storageKey('event', result.verificationId);
      await tx.insert(eventKey, { type: 'receipt.job.review_required', result, createdAt: now() });
      await finish(tx, c, current, result, eventKey);
      return 'COMPLETED';
    });
  const api: DurableVerifier = {
    async initialize() {
      await storage.transaction(async (tx) => {
        const existing = await tx.get(controlKey);
        if (existing !== undefined) {
          await control(tx);
          return;
        }
        await tx.insert(controlKey, {
          signature,
          pending: 0,
          retained: 0,
          revision: 0,
          circuits: { telebirr: { failures: 0, until: 0 }, cbe: { failures: 0, until: 0 } },
        });
      });
    },
    async enqueue(source) {
      scope(source);
      if (!identifier(source.idempotencyKey)) throw new JobError('INVALID_INPUT');
      const input = {
        tenantId: source.tenantId,
        paymentId: source.paymentId,
        idempotencyKey: source.idempotencyKey,
        receiptLocator: source.receiptLocator,
      };
      const expectationKey = storageKey('expectation', input.tenantId, input.paymentId);
      const stored = await storage.read(expectationKey);
      if (stored === undefined) throw new JobError('NOT_FOUND');
      const before = snapshot(stored, input);
      let locator: ReturnType<typeof normalizeReceiptLocator>;
      try {
        locator = normalizeReceiptLocator(before.expectation.provider, input.receiptLocator);
      } catch {
        throw new JobError('INVALID_INPUT');
      }
      const jobId = storageKey('job', input.tenantId, input.paymentId, locator.url);
      const aliasKey = storageKey('jobalias', input.tenantId, input.idempotencyKey);
      return storage.transaction(async (tx) => {
        const c = await control(tx);
        const alias = await tx.get(aliasKey);
        if (alias !== undefined && object(alias).jobId !== jobId)
          throw new JobError('IDEMPOTENCY_CONFLICT');
        const existing = await tx.get(jobId);
        if (existing !== undefined) {
          const job = jobRecord(existing);
          if (alias === undefined) {
            if (job.aliases.length >= 8) throw new JobError('CAPACITY');
            job.aliases.push(aliasKey);
            await tx.insert(aliasKey, { jobId });
            await tx.set(jobId, job);
          }
          return publicJob(job);
        }
        if (alias !== undefined) throw new JobError('CORRUPT_STATE');
        const current = snapshot(await tx.get(expectationKey), input);
        if (
          current.digest !== before.digest ||
          current.state !== 'OPEN' ||
          now() > current.expectation.validUntil
        )
          throw new JobError('NOT_OPEN');
        if (c.pending >= policy.maxPending || c.retained >= policy.maxRetained)
          throw new JobError('CAPACITY');
        const time = now();
        const job: JobRecord = {
          tenantId: input.tenantId,
          paymentId: input.paymentId,
          jobId,
          provider: locator.provider,
          state: 'QUEUED',
          attempts: 0,
          createdAt: time,
          updatedAt: time,
          nextRunAt: time,
          settlementStatus: 'UNCONFIRMED',
          snapshot: current.digest,
          encrypted: '',
          aliases: [aliasKey],
          lease: '',
          leaseUntil: 0,
          history: [],
        };
        job.encrypted = encrypt(job, { ...input, receiptLocator: locator.url });
        await tx.insert(jobId, job);
        await tx.insert(aliasKey, { jobId });
        c.pending++;
        c.retained++;
        await tx.set(controlKey, c);
        return publicJob(job);
      });
    },
    async status(expected, jobId) {
      scope(expected);
      if (!/^rv1:job:[a-f0-9]{64}$/u.test(jobId)) throw new JobError('INVALID_INPUT');
      const value = await storage.read(jobId);
      if (value === undefined) throw new JobError('NOT_FOUND');
      const job = jobRecord(value);
      if (
        job.jobId !== jobId ||
        job.tenantId !== expected.tenantId ||
        job.paymentId !== expected.paymentId
      )
        throw new JobError('NOT_FOUND');
      return publicJob(job);
    },
    async runOnce(options = {}) {
      if (active >= policy.concurrency) return 'BUSY';
      if (options.signal?.aborted) return 'IDLE';
      active++;
      try {
        const held = await storage.transaction(async (tx) => {
          const c = await control(tx),
            time = now();
          const jobs = (await tx.scan('rv1:job:', policy.maxRetained)).map((r) =>
            jobRecord(r.value),
          );
          if (
            jobs.filter((j) => j.state === 'RUNNING' && j.leaseUntil > time).length >=
            policy.concurrency
          )
            return undefined;
          const job = jobs
            .filter(
              (j) =>
                j.state !== 'COMPLETED' &&
                j.nextRunAt <= time &&
                (j.state !== 'RUNNING' || j.leaseUntil <= time) &&
                c.circuits[j.provider].until <= time,
            )
            .sort((a, b) => a.createdAt - b.createdAt || a.jobId.localeCompare(b.jobId))[0];
          if (!job) return undefined;
          if (job.state === 'RUNNING') {
            const last = job.history.at(-1);
            if (last) {
              last.finishedAt = time;
              last.outcome = 'LEASE_EXPIRED';
            }
          }
          if (job.attempts < policy.maxAttempts) {
            job.attempts++;
            job.history.push({ startedAt: time });
          }
          job.state = 'RUNNING';
          job.updatedAt = time;
          job.lease = randomBytes(16).toString('hex');
          job.leaseUntil = time + policy.leaseMs;
          await tx.set(job.jobId, job);
          return job;
        });
        if (!held) return 'IDLE';
        let input: VerificationSubmission;
        let changed: boolean;
        try {
          input = decrypt(held);
          changed =
            snapshot(
              await storage.read(storageKey('expectation', held.tenantId, held.paymentId)),
              held,
            ).digest !== held.snapshot;
        } catch {
          return await review(held);
        }
        if (changed) return await review(held);
        // Exhausted crash recovery makes no new provider request. Retry count stays bounded.
        const exhaustedCrash = held.history.at(-1)?.outcome === 'LEASE_EXPIRED';
        const prepared = await (exhaustedCrash ? unavailableVerifier : verifier).prepare(input, {
          timeoutMs: policy.timeoutMs,
          ...(options.signal ? { signal: options.signal } : {}),
        });
        try {
          return await storage.transaction(async (tx) => {
            const c = await control(tx),
              current = jobRecord(await tx.get(held.jobId));
            if (!matchesLease(current, held)) return 'STALE';
            if (
              snapshot(await tx.get(storageKey('expectation', held.tenantId, held.paymentId)), held)
                .digest !== held.snapshot
            ) {
              // Abort before verification; the outer path writes an operator-review event.
              throw new JobError('NOT_OPEN');
            }
            const scoped: VerificationStorage = {
              callerTransaction: true,
              read: (key) => tx.get(key),
              transaction: async (work) => work(tx),
            };
            const result = await verifier.complete(prepared, scoped);
            if (
              result.verificationStatus === 'UNABLE_TO_VERIFY' &&
              Object.keys(result.checks).length === 0 &&
              current.attempts < policy.maxAttempts
            )
              throw new RetryUnavailable();
            await finish(tx, c, current, result, storageKey('event', result.verificationId));
            return 'COMPLETED';
          });
        } catch (error) {
          if (error instanceof JobError && error.code === 'NOT_OPEN') return await review(held);
          if (!(error instanceof RetryUnavailable)) throw error;
          return await storage.transaction(async (tx) => {
            const c = await control(tx),
              current = jobRecord(await tx.get(held.jobId));
            if (!matchesLease(current, held)) return 'STALE';
            const delay = Math.min(60000, policy.backoffMs * 2 ** (current.attempts - 1));
            current.state = 'RETRY_WAIT';
            current.updatedAt = now();
            current.nextRunAt = now() + delay + randomInt(0, Math.max(1, Math.ceil(delay / 4)));
            current.lease = '';
            current.leaseUntil = 0;
            const last = current.history.at(-1);
            if (last) {
              last.finishedAt = current.updatedAt;
              last.outcome = 'UNAVAILABLE';
            }
            const circuit = c.circuits[current.provider];
            circuit.failures = Math.min(1000, circuit.failures + 1);
            if (circuit.failures >= 3) circuit.until = current.nextRunAt;
            await tx.set(controlKey, c);
            await tx.set(current.jobId, current);
            return 'RETRY_WAIT';
          });
        }
      } finally {
        active--;
      }
    },
    async pruneCompleted(before, limit = 100) {
      if (
        !Number.isSafeInteger(before) ||
        before < 0 ||
        before > now() ||
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > 1000
      )
        throw new JobError('INVALID_INPUT');
      return storage.transaction(async (tx) => {
        const c = await control(tx);
        let removed = 0;
        for (const row of await tx.scan('rv1:job:', policy.maxRetained)) {
          const job = jobRecord(row.value);
          if (
            job.state !== 'COMPLETED' ||
            job.updatedAt >= before ||
            (await tx.get(job.eventKey!)) !== undefined
          )
            continue;
          for (const alias of job.aliases) await tx.delete(alias);
          await tx.delete(row.key);
          c.retained--;
          removed++;
          if (removed >= limit) break;
        }
        await tx.set(controlKey, c);
        return removed;
      });
    },
  };
  return api;
}
