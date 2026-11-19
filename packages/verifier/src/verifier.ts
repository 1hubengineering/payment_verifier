import { compareReceipt, createPaymentExpectation } from './comparison.ts';
import type { PaymentExpectation } from './comparison.ts';
import { providerMessages, VerificationOperationError } from './outcomes.ts';
import type { InvalidInputResult, VerificationResult } from './outcomes.ts';
import type { DetectedPaymentInput, InputType } from './input.ts';
import type { ProviderId } from './types.ts';
import type { RecordTransaction, StoredRecord, VerificationStorage } from './storage.ts';
import { officialLocator } from './providers/locator.ts';
import type { ProviderResult } from './providers/index.ts';
import type { RetrievalOptions } from './providers/https.ts';
import {
  attemptRecord,
  canonicalFingerprint,
  detectSubmission,
  ensureStore,
  expectationRecord,
  normalizeProviderResult,
  operation,
  payloadVersion,
  readRecord,
  receiptSnapshot,
  replayAttempt,
  replayJobBinding,
  requireOpen,
  resultRecord,
  scopeKey,
  storageKey,
  submission,
  transact,
} from './verification-records.ts';
import type { PaymentScope, VerificationSubmission } from './verification-records.ts';

export { storageKey } from './verification-records.ts';
export type { PaymentScope, VerificationSubmission } from './verification-records.ts';
export type { VerificationResult } from './outcomes.ts';

export interface ReceiptProvider {
  retrieve(locator: string, options?: RetrievalOptions): Promise<ProviderResult>;
}

declare const preparedBrand: unique symbol;
export interface PreparedVerification {
  readonly [preparedBrand]: true;
}
export interface ReceiptVerifier {
  initialize(): Promise<void>;
  registerExpectation(expectation: PaymentExpectation): Promise<void>;
  cancelExpectation(scope: PaymentScope): Promise<void>;
  prepare(input: VerificationSubmission, options?: RetrievalOptions): Promise<PreparedVerification>;
  complete(
    prepared: PreparedVerification,
    storage?: VerificationStorage,
  ): Promise<VerificationResult>;
  submit(input: VerificationSubmission, options?: RetrievalOptions): Promise<VerificationResult>;
  events(limit?: number): Promise<readonly StoredRecord[]>;
  acknowledgeEvent(key: string): Promise<void>;
}

interface PreparedAttempt {
  readonly input: VerificationSubmission;
  readonly detected: DetectedPaymentInput;
  readonly fingerprint: string;
  readonly snapshot: string;
  readonly signal: AbortSignal | undefined;
  readonly outcome: ProviderResult | undefined;
  readonly workerJobId: string | undefined;
}

function observed(data: PreparedAttempt, expectation: PaymentExpectation): VerificationResult {
  const outcome = data.outcome;
  if (outcome === undefined) throw operation('CORRUPT_STATE', 'storage');
  const base = {
    tenantId: data.input.tenantId,
    paymentId: data.input.paymentId,
    expectedProvider: expectation.provider,
    verificationId: storageKey('verification', data.input.tenantId, data.input.idempotencyKey),
    input: data.detected,
    details: {},
  };
  if (outcome.kind === 'UNAVAILABLE')
    return {
      ...base,
      verified: false,
      status: 'UNAVAILABLE',
      code: outcome.code,
      stage: outcome.stage,
      retryable: outcome.retryable,
      message: providerMessages[outcome.code],
      details: outcome.details,
      checks: [],
      receipt: null,
      source: null,
    };
  if (outcome.kind === 'NOT_FOUND')
    return {
      ...base,
      verified: false,
      status: 'NOT_FOUND',
      code: 'RECEIPT_NOT_FOUND',
      stage: 'receipt_retrieval',
      retryable: outcome.retryable ?? false,
      message: 'The provider confirmed the receipt was not found.',
      details: outcome.details ?? {},
      checks: [],
      receipt: null,
      source: null,
    };
  const { evidence, provenance } = outcome;
  const compared = compareReceipt(
    expectation,
    evidence,
    data.detected.provider === 'telebirr' ? data.detected.identifier : undefined,
  );
  const receipt = receiptSnapshot(evidence);
  const source = {
    kind: 'OFFICIAL_RECEIPT' as const,
    retrievedAt: new Date(provenance.retrievedAt).toISOString(),
    parserVersion: provenance.parserVersion,
    contentHash: provenance.sha256,
  };
  const found = { ...base, checks: compared.checks, receipt, source };
  if (compared.status === 'MISMATCH')
    return {
      ...found,
      verified: false,
      status: 'MISMATCH',
      code: compared.code,
      stage: 'comparison',
      retryable:
        compared.code === 'PAYMENT_PENDING' &&
        outcome.pendingRetryable === true &&
        compared.checks.every(
          (check) =>
            check.status === 'PASS' ||
            check.status === 'SKIPPED' ||
            check.code === 'PAYMENT_PENDING',
        ),
      message:
        compared.code === 'AMOUNT_UNDERPAID' || compared.code === 'AMOUNT_OVERPAID'
          ? 'The transferred amount is outside the accepted range.'
          : compared.code === 'PAYMENT_PENDING'
            ? 'The official receipt reports a pending payment.'
            : 'One or more required checks failed against the official receipt.',
    };
  if (compared.status === 'INCOMPLETE')
    return {
      ...found,
      verified: false,
      status: 'UNAVAILABLE',
      code: compared.code,
      stage: 'comparison',
      retryable: false,
      message: 'The official receipt lacks usable evidence for one or more required checks.',
    };
  if (
    receipt.provider === null ||
    receipt.transactionId === null ||
    receipt.paymentStatus !== 'SUCCESSFUL' ||
    receipt.amountMinor === null ||
    receipt.currency !== 'ETB'
  )
    throw operation('INVALID_ADAPTER_RESULT', 'adapter');
  return {
    ...found,
    verified: true,
    status: 'VERIFIED',
    code: 'PAYMENT_VERIFIED',
    stage: 'completion',
    retryable: false,
    message: 'The official receipt passed all required payment checks.',
    receipt: {
      ...receipt,
      provider: receipt.provider,
      transactionId: receipt.transactionId,
      paymentStatus: receipt.paymentStatus,
      amountMinor: receipt.amountMinor,
      currency: receipt.currency,
    },
  };
}

interface WorkerReceiptVerifier extends ReceiptVerifier {
  prepare(
    input: VerificationSubmission,
    options?: RetrievalOptions,
    worker?: { inputType: InputType; jobId: string },
  ): Promise<PreparedVerification>;
}

export function createReceiptVerifier(config: VerifierConfig): ReceiptVerifier {
  return createWorkerReceiptVerifier(config);
}

interface VerifierConfig {
  readonly storage: VerificationStorage;
  readonly providers: Readonly<Partial<Record<ProviderId, ReceiptProvider>>>;
  readonly now?: () => number;
}

export function createWorkerReceiptVerifier(config: VerifierConfig): WorkerReceiptVerifier {
  const { storage } = config;
  const preparations = new WeakMap<PreparedVerification, PreparedAttempt | InvalidInputResult>();
  const now = (): number => {
    const value = (config.now ?? Date.now)();
    if (!Number.isSafeInteger(value) || value < 0) throw operation('INVALID_REQUEST', 'request');
    return value;
  };
  function prepareToken(data: PreparedAttempt | InvalidInputResult): PreparedVerification {
    const token = Object.freeze({}) as PreparedVerification;
    preparations.set(token, data);
    return token;
  }
  const verifier: WorkerReceiptVerifier = {
    async initialize() {
      await transact(storage, ensureStore);
    },
    async registerExpectation(value) {
      let expectation: PaymentExpectation;
      try {
        expectation = createPaymentExpectation(value);
      } catch (cause) {
        if (cause instanceof VerificationOperationError) throw cause;
        throw operation('INVALID_EXPECTATION', 'expectation', cause);
      }
      const key = scopeKey(expectation);
      await transact(storage, async (tx) => {
        await ensureStore(tx);
        const existing = await tx.get(key);
        if (existing !== undefined) {
          if (
            JSON.stringify(expectationRecord(existing, expectation).expectation) !==
            JSON.stringify(expectation)
          )
            throw operation('EXPECTATION_CONFLICT', 'expectation');
          return;
        }
        await tx.insert(key, { version: payloadVersion, expectation, state: 'OPEN' });
      });
    },
    async cancelExpectation(scope) {
      const key = scopeKey(scope);
      await transact(storage, async (tx) => {
        const stored = expectationRecord(await tx.get(key), scope);
        if (stored.state === 'OPEN') await tx.set(key, { ...stored, state: 'CANCELLED' });
      });
    },
    async prepare(source, options, worker) {
      if (storage.callerTransaction) throw operation('INVALID_REQUEST', 'request');
      if (options?.signal?.aborted) throw operation('OPERATION_CANCELLED', 'request');
      const input = submission(source);
      const stored = expectationRecord(await readRecord(storage, scopeKey(input)), input);
      const parsed = detectSubmission(input, stored.expectation.provider);
      if ('status' in parsed) return prepareToken(parsed);
      const detected = worker === undefined ? parsed : { ...parsed, inputType: worker.inputType };
      const locator = officialLocator(detected);
      const fingerprint = canonicalFingerprint(input, detected);
      const existing = attemptRecord(
        await readRecord(storage, storageKey('attempt', input.tenantId, input.idempotencyKey)),
        input,
      );
      let outcome: ProviderResult | undefined;
      const queued = await replayJobBinding(
        (key) => readRecord(storage, key),
        input,
        fingerprint,
        worker?.jobId,
      );
      if (existing) replayAttempt(existing, input, fingerprint);
      else if (!queued) {
        requireOpen(stored, now());
        const provider = config.providers[detected.provider];
        if (!provider) throw operation('PROVIDER_NOT_CONFIGURED', 'provider_configuration');
        if (options?.signal?.aborted) throw operation('OPERATION_CANCELLED', 'request');
        let called: unknown;
        try {
          called = await provider.retrieve(locator.url, options);
        } catch (cause) {
          if (cause instanceof VerificationOperationError) throw cause;
          throw operation('INTERNAL_ERROR', 'adapter', cause);
        }
        if (options?.signal?.aborted) throw operation('OPERATION_CANCELLED', 'request');
        outcome = normalizeProviderResult(called, locator.url);
      }
      return prepareToken({
        input: { ...input, receiptLocator: detected.identifier },
        detected,
        fingerprint,
        snapshot: JSON.stringify(stored.expectation),
        signal: options?.signal,
        outcome,
        workerJobId: worker?.jobId,
      });
    },
    async complete(prepared, target = storage) {
      const data = preparations.get(prepared);
      if (!data) throw operation('INVALID_PREPARATION', 'completion');
      if ('status' in data) return data;
      const { input } = data;
      const work = async (tx: RecordTransaction): Promise<VerificationResult> => {
        const key = scopeKey(input);
        const stored = expectationRecord(await tx.get(key), input);
        const attemptKey = storageKey('attempt', input.tenantId, input.idempotencyKey);
        const previous = attemptRecord(await tx.get(attemptKey), input);
        if (previous) return replayAttempt(previous, input, data.fingerprint);
        const queued = await replayJobBinding(
          (key) => tx.get(key),
          input,
          data.fingerprint,
          data.workerJobId,
        );
        if (queued) return queued;
        if (data.signal?.aborted) throw operation('OPERATION_CANCELLED', 'request');
        if (JSON.stringify(stored.expectation) !== data.snapshot)
          throw operation('EXPECTATION_CHANGED', 'expectation');
        requireOpen(stored, now());
        const result = resultRecord(observed(data, stored.expectation), input);
        if (result.status === 'VERIFIED') {
          const claimKey = storageKey(
            'claim',
            result.expectedProvider,
            result.receipt.transactionId,
          );
          if ((await tx.get(claimKey)) !== undefined)
            throw operation('RECEIPT_ALREADY_CLAIMED', 'completion');
          await tx.insert(claimKey, {
            tenantId: input.tenantId,
            paymentId: input.paymentId,
            verificationId: result.verificationId,
          });
          await tx.set(key, { ...stored, state: 'RECEIPT_CLAIMED' });
        }
        await tx.insert(attemptKey, {
          version: payloadVersion,
          fingerprint: data.fingerprint,
          result,
        });
        await tx.insert(storageKey('event', result.verificationId!), {
          type: 'receipt.verification.completed',
          result,
          createdAt: now(),
        });
        return result;
      };
      return data.workerJobId === undefined ? transact(target, work) : target.transaction(work);
    },
    async submit(input, options) {
      return verifier.complete(await verifier.prepare(input, options));
    },
    async events(limit = 100) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000)
        throw operation('INVALID_REQUEST', 'request');
      return transact(storage, async (tx) => {
        await ensureStore(tx);
        return tx.scan('rv1:event:', limit);
      });
    },
    async acknowledgeEvent(key) {
      if (!/^rv1:event:[a-f0-9]{64}$/.test(key)) throw operation('INVALID_REQUEST', 'request');
      await transact(storage, async (tx) => {
        await ensureStore(tx);
        await tx.delete(key);
      });
    },
  };
  return verifier;
}
