import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
} from 'node:crypto';
import { createWorkerReceiptVerifier } from './verifier.ts';
import type { PreparedVerification, ReceiptProvider } from './verifier.ts';
import { VerificationOperationError } from './outcomes.ts';
import type {
  OperationErrorCode,
  SerializedVerificationOperationError,
  VerificationResult,
} from './outcomes.ts';
import type { RecordTransaction, VerificationStorage } from './storage.ts';
import type { ProviderId } from './types.ts';
import { PAYMENT_INPUT_LIMIT } from './input.ts';
import type { InputType } from './input.ts';
import {
  attemptRecord,
  canonicalFingerprint,
  detectSubmission,
  ensureStore,
  expectationRecord,
  identifier,
  object,
  operation,
  payloadVersion,
  readRecord,
  replayAttempt,
  requireOpen,
  resultRecord,
  scopeKey,
  serializedError,
  storageKey,
  submission,
  transact,
} from './verification-records.ts';
import type { PaymentScope, VerificationSubmission } from './verification-records.ts';

export interface JobPolicy {
  readonly maxPending: number;
  readonly maxRetained: number;
  readonly concurrency: number;
  readonly maxAttempts: number;
  readonly timeoutMs: number;
  readonly leaseMs: number;
  readonly backoffMs: number;
}
interface JobSummary extends PaymentScope {
  readonly jobId: string;
  readonly attempts: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly nextRunAt: number;
}
export type VerificationJob = JobSummary &
  (
    | {
        readonly state: 'QUEUED' | 'RUNNING' | 'RETRY_WAIT';
        readonly result?: never;
        readonly error?: never;
      }
    | { readonly state: 'COMPLETED'; readonly result: VerificationResult; readonly error?: never }
    | {
        readonly state: 'FAILED';
        readonly error: SerializedVerificationOperationError;
        readonly result?: never;
      }
  );
export interface DurableVerifier {
  initialize(): Promise<void>;
  enqueue(input: VerificationSubmission): Promise<VerificationJob>;
  status(scope: PaymentScope, jobId: string): Promise<VerificationJob>;
  runOnce(options?: {
    readonly signal?: AbortSignal;
  }): Promise<'IDLE' | 'BUSY' | 'STALE' | 'RETRY_WAIT' | 'COMPLETED' | 'FAILED'>;
  pruneCompleted(before: number, limit?: number): Promise<number>;
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
type JobRecord = { -readonly [K in keyof JobSummary]: JobSummary[K] } & {
  readonly version: typeof payloadVersion;
  state: VerificationJob['state'];
  result?: VerificationResult;
  error?: SerializedVerificationOperationError;
  provider: ProviderId;
  fingerprint: string;
  snapshot: string;
  encrypted: string;
  aliases: string[];
  lease: string;
  leaseUntil: number;
  eventKey?: string;
  history: {
    startedAt: number;
    finishedAt?: number;
    outcome?: 'RETRY' | 'COMPLETED' | 'FAILED' | 'LEASE_EXPIRED';
  }[];
};
const controlKey = storageKey('jobcontrol', 'v2');
const jobKey = /^rv1:job:[a-f0-9]{64}$/u;
const aliasPattern = /^rv1:jobalias:[a-f0-9]{64}$/u;
const terminal = (job: Pick<JobRecord, 'state'>): boolean =>
  job.state === 'COMPLETED' || job.state === 'FAILED';
const activeKey = (job: Pick<JobRecord, 'tenantId' | 'fingerprint'>): string =>
  storageKey('jobactive', job.tenantId, job.fingerprint);
const historyKey = (id: string): string => storageKey('jobhistory', id);
function jobError(code: OperationErrorCode, cause?: unknown): VerificationOperationError {
  return operation(code, 'queue', cause);
}
function snapshot(value: unknown, expected: PaymentScope) {
  const record = expectationRecord(value, expected);
  return {
    ...record,
    digest: createHash('sha256').update(JSON.stringify(record.expectation)).digest('hex'),
  };
}
function jobRecord(value: unknown): JobRecord {
  const record = object(value);
  if (record.version !== payloadVersion) throw jobError('INCOMPATIBLE_STORE');
  if (
    typeof record.jobId !== 'string' ||
    !jobKey.test(record.jobId) ||
    !identifier(record.tenantId) ||
    !identifier(record.paymentId) ||
    !['QUEUED', 'RUNNING', 'RETRY_WAIT', 'COMPLETED', 'FAILED'].includes(record.state as string) ||
    !['telebirr', 'cbe'].includes(record.provider as string) ||
    typeof record.fingerprint !== 'string' ||
    !/^rv1:input:[a-f0-9]{64}$/u.test(record.fingerprint) ||
    typeof record.snapshot !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(record.snapshot) ||
    typeof record.encrypted !== 'string' ||
    record.encrypted.length > 12000 ||
    !Array.isArray(record.aliases) ||
    record.aliases.length < 1 ||
    record.aliases.length > 8 ||
    record.aliases.some((a) => typeof a !== 'string' || !aliasPattern.test(a)) ||
    typeof record.lease !== 'string' ||
    !Array.isArray(record.history) ||
    record.history.length > 10 ||
    ['attempts', 'createdAt', 'updatedAt', 'nextRunAt', 'leaseUntil'].some(
      (k) => !Number.isSafeInteger(record[k]) || (record[k] as number) < 0,
    ) ||
    (record.attempts as number) > 10
  )
    throw jobError('CORRUPT_STATE');
  const job = record as unknown as JobRecord;
  if (terminal(job)) {
    if (job.encrypted !== '' || job.lease !== '' || job.leaseUntil !== 0 || job.nextRunAt !== 0)
      throw jobError('CORRUPT_STATE');
    if (job.state === 'COMPLETED') {
      const result = resultRecord(job.result, job);
      if (
        result.verificationId === null ||
        job.eventKey !== storageKey('event', result.verificationId) ||
        job.error
      )
        throw jobError('CORRUPT_STATE');
    } else {
      serializedError(job.error);
      if (job.eventKey !== storageKey('event', job.jobId) || job.result)
        throw jobError('CORRUPT_STATE');
    }
  } else if (job.result || job.error || job.eventKey || !job.encrypted) {
    throw jobError('CORRUPT_STATE');
  }
  return job;
}

function publicJob(job: JobRecord): VerificationJob {
  const { tenantId, paymentId, jobId, attempts, createdAt, updatedAt, nextRunAt, state } = job;
  const summary = { tenantId, paymentId, jobId, attempts, createdAt, updatedAt, nextRunAt };
  if (state === 'COMPLETED') return { ...summary, state, result: structuredClone(job.result!) };
  if (state === 'FAILED') return { ...summary, state, error: structuredClone(job.error!) };
  return { ...summary, state };
}
class RetryObservation extends VerificationOperationError {
  constructor(
    readonly delay: number,
    readonly providerFailure: boolean,
  ) {
    super('INTERNAL_ERROR', 'queue');
  }
}

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
    throw jobError('QUEUE_CONFIGURATION');
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
    throw jobError('QUEUE_CONFIGURATION');
  const signature = createHash('sha256')
    .update(secret)
    .update(JSON.stringify(policy))
    .digest('hex');
  const now = (): number => {
    const time = (config.now ?? Date.now)();
    if (!Number.isSafeInteger(time) || time < 0 || time > Number.MAX_SAFE_INTEGER - 1_000_000)
      throw jobError('INVALID_REQUEST');
    return time;
  };
  const verifier = createWorkerReceiptVerifier({ storage, providers: config.providers, now });
  let active = 0;
  const control = async (tx: RecordTransaction): Promise<Control> => {
    const value = object(await tx.get(controlKey));
    if (value.signature !== signature) throw jobError('QUEUE_CONFIGURATION');
    if (
      ['pending', 'retained', 'revision'].some(
        (k) => !Number.isSafeInteger(value[k]) || (value[k] as number) < 0,
      ) ||
      (value.pending as number) > (value.retained as number) ||
      (value.retained as number) > policy.maxRetained
    )
      throw jobError('CORRUPT_STATE');
    for (const provider of ['telebirr', 'cbe']) {
      const c = object(object(value.circuits)[provider]);
      if (
        !Number.isSafeInteger(c.failures) ||
        !Number.isSafeInteger(c.until) ||
        (c.failures as number) < 0 ||
        (c.until as number) < 0
      )
        throw jobError('CORRUPT_STATE');
    }
    const result = value as unknown as Control;
    result.revision++;
    await tx.set(controlKey, result);
    return result;
  };
  const encrypt = (
    job: Pick<JobRecord, 'jobId' | 'snapshot'>,
    input: VerificationSubmission,
    inputType: InputType,
  ): string => {
    const nonce = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', secret, nonce);
    cipher.setAAD(Buffer.from(JSON.stringify([job.jobId, job.snapshot])));
    const body = Buffer.concat([
      cipher.update(
        JSON.stringify({
          idempotencyKey: input.idempotencyKey,
          receiptLocator: input.receiptLocator,
          inputType,
        }),
        'utf8',
      ),
      cipher.final(),
    ]);
    return Buffer.concat([nonce, cipher.getAuthTag(), body]).toString('base64');
  };
  const decrypt = (job: JobRecord): { input: VerificationSubmission; inputType: InputType } => {
    try {
      const bytes = Buffer.from(job.encrypted, 'base64');
      const decipher = createDecipheriv('aes-256-gcm', secret, bytes.subarray(0, 12));
      decipher.setAAD(Buffer.from(JSON.stringify([job.jobId, job.snapshot])));
      decipher.setAuthTag(bytes.subarray(12, 28));
      const decoded = object(
        JSON.parse(
          Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'),
        ),
      );
      if (
        !identifier(decoded.idempotencyKey) ||
        typeof decoded.receiptLocator !== 'string' ||
        (decoded.inputType !== 'identifier' &&
          decoded.inputType !== 'receipt_url' &&
          decoded.inputType !== 'sms')
      )
        throw jobError('CORRUPT_STATE');
      const input = {
        tenantId: job.tenantId,
        paymentId: job.paymentId,
        idempotencyKey: decoded.idempotencyKey,
        receiptLocator: decoded.receiptLocator,
      };
      const detected = detectSubmission(input, job.provider);
      if (
        'status' in detected ||
        canonicalFingerprint(input, detected) !== job.fingerprint ||
        storageKey('job', input.tenantId, input.idempotencyKey) !== job.jobId
      )
        throw jobError('CORRUPT_STATE');
      return { input, inputType: decoded.inputType };
    } catch (cause) {
      throw jobError('CORRUPT_STATE', cause);
    }
  };

  const matchesLease = (current: JobRecord, held: JobRecord): boolean =>
    current.state === 'RUNNING' && current.lease === held.lease && current.leaseUntil > now();

  async function finish(
    tx: RecordTransaction,
    c: Control,
    job: JobRecord,
    outcome: { result: VerificationResult } | { error: SerializedVerificationOperationError },
    wasPending = true,
    emitEvent = !wasPending,
  ): Promise<'COMPLETED' | 'FAILED'> {
    job.updatedAt = now();
    job.nextRunAt = 0;
    job.leaseUntil = 0;
    job.lease = '';
    job.encrypted = '';
    if ('result' in outcome) {
      job.state = 'COMPLETED';
      job.result = resultRecord(outcome.result, job);
      job.eventKey = storageKey('event', job.result.verificationId!);
      if (emitEvent)
        await tx.insert(job.eventKey, {
          type: 'receipt.verification.completed',
          result: job.result,
          createdAt: job.updatedAt,
        });
    } else {
      job.state = 'FAILED';
      job.error = outcome.error;
      job.eventKey = storageKey('event', job.jobId);
      await tx.insert(job.eventKey, {
        type: 'receipt.job.failed',
        jobId: job.jobId,
        error: job.error,
        createdAt: job.updatedAt,
      });
    }
    const history = job.history.at(-1);
    if (history && history.outcome !== 'LEASE_EXPIRED') {
      history.finishedAt = job.updatedAt;
      history.outcome = job.state;
    }
    if (wasPending) {
      c.pending--;
      await tx.delete(activeKey(job));
    }
    await tx.set(controlKey, c);
    if (wasPending) await tx.set(job.jobId, job);
    else await tx.insert(job.jobId, job);
    return job.state;
  }

  async function fail(
    held: JobRecord,
    error: VerificationOperationError,
  ): Promise<'STALE' | 'FAILED' | 'COMPLETED'> {
    return transact(storage, async (tx) => {
      const c = await control(tx);
      const current = jobRecord(await tx.get(held.jobId));
      if (!matchesLease(current, held)) return 'STALE';
      return finish(tx, c, current, { error: error.toJSON() });
    });
  }

  async function waitForRetry(
    held: JobRecord,
    retry: RetryObservation,
  ): Promise<'STALE' | 'RETRY_WAIT'> {
    return transact(storage, async (tx) => {
      const c = await control(tx);
      const current = jobRecord(await tx.get(held.jobId));
      if (!matchesLease(current, held)) return 'STALE';
      current.state = 'RETRY_WAIT';
      current.updatedAt = now();
      current.nextRunAt = current.updatedAt + retry.delay;
      current.lease = '';
      current.leaseUntil = 0;
      const last = current.history.at(-1);
      if (last) {
        last.finishedAt = current.updatedAt;
        last.outcome = 'RETRY';
      }
      if (retry.providerFailure) {
        const circuit = c.circuits[current.provider];
        circuit.failures = Math.min(1000, circuit.failures + 1);
        if (circuit.failures >= 3) circuit.until = current.nextRunAt;
      }
      await tx.set(controlKey, c);
      await tx.set(current.jobId, current);
      return 'RETRY_WAIT';
    });
  }

  const api: DurableVerifier = {
    async initialize() {
      await transact(storage, async (tx) => {
        await ensureStore(tx);
        if ((await tx.get(controlKey)) !== undefined) {
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
      const input = submission(source);
      const expectationKey = scopeKey(input);
      const before = snapshot(await readRecord(storage, expectationKey), input);
      const detected = detectSubmission(input, before.expectation.provider);
      const invalid = 'status' in detected;
      const fingerprint = invalid
        ? storageKey(
            'input',
            input.paymentId,
            'rejected',
            createHmac('sha256', secret)
              .update(
                input.receiptLocator.length > PAYMENT_INPUT_LIMIT
                  ? 'oversized'
                  : JSON.stringify(input.receiptLocator),
              )
              .digest('hex'),
          )
        : canonicalFingerprint(input, detected);
      const alias = storageKey('jobalias', input.tenantId, input.idempotencyKey);
      return transact(storage, async (tx) => {
        const c = await control(tx);
        const bound = await tx.get(alias);
        if (bound !== undefined) {
          const row = object(bound);
          if (row.fingerprint !== fingerprint) throw jobError('IDEMPOTENCY_CONFLICT');
          if (typeof row.jobId !== 'string' || !jobKey.test(row.jobId))
            throw jobError('CORRUPT_STATE');
          const existing = jobRecord(
            (await tx.get(row.jobId)) ?? (await tx.get(historyKey(row.jobId))),
          );
          if (
            existing.tenantId !== input.tenantId ||
            existing.paymentId !== input.paymentId ||
            existing.jobId !== row.jobId ||
            existing.fingerprint !== fingerprint
          )
            throw jobError('CORRUPT_STATE');
          return publicJob(existing);
        }
        const attempt = attemptRecord(
          await tx.get(storageKey('attempt', input.tenantId, input.idempotencyKey)),
          input,
        );
        const replayed = attempt && replayAttempt(attempt, input, fingerprint);
        const current = snapshot(await tx.get(expectationKey), input);
        if (current.digest !== before.digest) throw operation('EXPECTATION_CHANGED', 'expectation');
        const index = activeKey({ tenantId: input.tenantId, fingerprint });
        const pending = invalid || replayed ? undefined : await tx.get(index);
        if (pending !== undefined) {
          if (typeof pending !== 'string' || !jobKey.test(pending)) throw jobError('CORRUPT_STATE');
          const job = jobRecord(await tx.get(pending));
          if (
            terminal(job) ||
            job.tenantId !== input.tenantId ||
            job.paymentId !== input.paymentId ||
            job.fingerprint !== fingerprint
          )
            throw jobError('CORRUPT_STATE');
          if (job.aliases.length >= 8) throw jobError('QUEUE_CAPACITY');
          job.aliases.push(alias);
          await tx.insert(alias, { jobId: pending, fingerprint });
          await tx.set(pending, job);
          return publicJob(job);
        }
        if (!invalid && !replayed) requireOpen(current, now());
        if (
          (!invalid && !replayed && c.pending >= policy.maxPending) ||
          c.retained >= policy.maxRetained
        )
          throw jobError('QUEUE_CAPACITY');
        const jobId = storageKey('job', input.tenantId, input.idempotencyKey);
        const time = now();
        const job: JobRecord = {
          version: payloadVersion,
          tenantId: input.tenantId,
          paymentId: input.paymentId,
          jobId,
          provider: before.expectation.provider,
          fingerprint,
          state: 'QUEUED',
          attempts: 0,
          createdAt: time,
          updatedAt: time,
          nextRunAt: time,
          snapshot: current.digest,
          encrypted: '',
          aliases: [alias],
          lease: '',
          leaseUntil: 0,
          history: [],
        };
        await tx.insert(alias, { jobId, fingerprint });
        c.retained++;
        if (replayed) {
          await finish(tx, c, job, { result: replayed }, false, false);
        } else if (invalid) {
          await finish(
            tx,
            c,
            job,
            { result: { ...detected, verificationId: storageKey('jobresult', jobId) } },
            false,
          );
        } else {
          job.encrypted = encrypt(
            job,
            { ...input, receiptLocator: detected.identifier },
            detected.inputType,
          );
          await tx.insert(jobId, job);
          await tx.insert(index, jobId);
          c.pending++;
          await tx.set(controlKey, c);
        }
        return publicJob(job);
      });
    },
    async status(expected, jobId) {
      scopeKey(expected);
      if (!jobKey.test(jobId)) throw jobError('INVALID_REQUEST');
      const value = await readRecord(storage, jobId);
      if (value === undefined) throw jobError('JOB_NOT_FOUND');
      const job = jobRecord(value);
      if (
        job.jobId !== jobId ||
        job.tenantId !== expected.tenantId ||
        job.paymentId !== expected.paymentId
      )
        throw jobError('JOB_NOT_FOUND');
      return publicJob(job);
    },
    async runOnce(options = {}) {
      if (active >= policy.concurrency) return 'BUSY';
      if (options.signal?.aborted) return 'IDLE';
      active++;
      try {
        const held = await transact(storage, async (tx) => {
          const c = await control(tx);
          const time = now();
          const jobs = (await tx.scan('rv1:job:', policy.maxRetained)).map((row) =>
            jobRecord(row.value),
          );
          if (
            jobs.filter((job) => job.state === 'RUNNING' && job.leaseUntil > time).length >=
            policy.concurrency
          )
            return undefined;
          const job = jobs
            .filter(
              (job) =>
                !terminal(job) &&
                job.nextRunAt <= time &&
                (job.state !== 'RUNNING' || job.leaseUntil <= time) &&
                c.circuits[job.provider].until <= time,
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
        if (
          held.history.at(-1)?.outcome === 'LEASE_EXPIRED' ||
          (held.attempts >= policy.maxAttempts && held.history.at(-1)?.outcome === 'RETRY')
        )
          return fail(held, jobError('QUEUE_ATTEMPTS_EXHAUSTED'));
        let prepared: PreparedVerification;
        try {
          const { input, inputType } = decrypt(held);
          const accepted = snapshot(await readRecord(storage, scopeKey(held)), held);
          if (accepted.digest !== held.snapshot)
            throw operation('EXPECTATION_CHANGED', 'expectation');
          prepared = await verifier.prepare(
            input,
            {
              timeoutMs: Math.min(
                policy.timeoutMs,
                Math.max(1, accepted.expectation.validUntil - now()),
              ),
              ...(options.signal ? { signal: options.signal } : {}),
            },
            { inputType, jobId: held.jobId },
          );
        } catch (error) {
          if (!(error instanceof VerificationOperationError)) throw error;
          if (error.code === 'STORAGE_FAILURE' || error.code === 'STORAGE_OUTCOME_UNKNOWN')
            throw error;
          if (
            error.code === 'OPERATION_CANCELLED' &&
            options.signal?.aborted &&
            held.attempts < policy.maxAttempts
          )
            return waitForRetry(held, new RetryObservation(0, false));
          return fail(held, error);
        }
        try {
          return await transact(storage, async (tx) => {
            const c = await control(tx);
            const current = jobRecord(await tx.get(held.jobId));
            if (!matchesLease(current, held)) return 'STALE';
            const accepted = snapshot(await tx.get(scopeKey(held)), held);
            if (accepted.digest !== held.snapshot)
              throw operation('EXPECTATION_CHANGED', 'expectation');
            // The verifier uses this actual transaction. A retry rolls back the provisional result.
            const scoped: VerificationStorage = {
              callerTransaction: true,
              read: (key) => tx.get(key),
              transaction: async (work) => work(tx),
            };
            const result = await verifier.complete(prepared, scoped);
            const providerFailure =
              result.status === 'UNAVAILABLE' && result.stage !== 'comparison';
            if (result.retryable && current.attempts < policy.maxAttempts) {
              const backoff = Math.min(60_000, policy.backoffMs * 2 ** (current.attempts - 1));
              const hinted =
                typeof result.details.retryAfterMs === 'number' ? result.details.retryAfterMs : 0;
              const delay = Math.max(
                hinted,
                Math.min(60_000, backoff + randomInt(0, Math.max(1, Math.ceil(backoff / 4)))),
              );
              if (now() + delay <= accepted.expectation.validUntil)
                throw new RetryObservation(delay, providerFailure);
            }
            if (providerFailure && result.retryable) {
              const circuit = c.circuits[current.provider];
              circuit.failures = Math.min(1000, circuit.failures + 1);
              if (circuit.failures >= 3) circuit.until = now() + policy.backoffMs;
            } else if (result.status !== 'UNAVAILABLE' || result.stage === 'comparison') {
              c.circuits[current.provider] = { failures: 0, until: 0 };
            }
            return finish(tx, c, current, { result });
          });
        } catch (error) {
          if (error instanceof RetryObservation) return waitForRetry(held, error);
          if (
            !(error instanceof VerificationOperationError) ||
            error.code === 'STORAGE_FAILURE' ||
            error.code === 'STORAGE_OUTCOME_UNKNOWN'
          )
            throw error;
          if (
            error.code === 'OPERATION_CANCELLED' &&
            options.signal?.aborted &&
            held.attempts < policy.maxAttempts
          )
            return waitForRetry(held, new RetryObservation(0, false));
          return fail(held, error);
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
        throw jobError('INVALID_REQUEST');
      return transact(storage, async (tx) => {
        const c = await control(tx);
        let removed = 0;
        for (const row of await tx.scan('rv1:job:', policy.maxRetained)) {
          const job = jobRecord(row.value);
          if (
            !terminal(job) ||
            job.updatedAt >= before ||
            (await tx.get(job.eventKey!)) !== undefined
          )
            continue;
          await tx.insert(historyKey(row.key), { ...job, history: [] });
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
