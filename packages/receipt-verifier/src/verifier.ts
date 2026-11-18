import { createHash } from 'node:crypto';
import { compareReceipt, createPaymentExpectation } from './comparison.ts';
import type { PaymentExpectation, ReceiptComparison } from './comparison.ts';
import type { ProviderId } from './types.ts';
import type { RecordTransaction, StoredRecord, VerificationStorage } from './storage.ts';
import { normalizeReceiptLocator } from './providers/locator.ts';
import type { ProviderResult } from './providers/index.ts';
import type { RetrievalOptions } from './providers/https.ts';

export interface PaymentScope {
  readonly tenantId: string;
  readonly paymentId: string;
}
export interface VerificationSubmission extends PaymentScope {
  readonly idempotencyKey: string;
  readonly receiptLocator: string;
}
export interface ReceiptProvider {
  retrieve(
    locator: string,
    options?: RetrievalOptions,
  ): Promise<ProviderResult | { readonly kind: 'UNAVAILABLE'; readonly code: 'BUSY' }>;
}
export interface VerificationResult extends PaymentScope {
  readonly verificationId: string;
  readonly verificationStatus:
    | ReceiptComparison['verificationStatus']
    | 'ALREADY_CLAIMED'
    | 'CANCELLED'
    | 'EXPIRED'
    | 'NEEDS_REVIEW'
    | 'IDEMPOTENCY_CONFLICT';
  readonly settlementStatus: 'UNCONFIRMED';
  readonly checks: ReceiptComparison['checks'];
}
declare const preparedBrand: unique symbol;
export interface PreparedVerification {
  readonly [preparedBrand]: true;
}
export interface ReceiptVerifier {
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
interface ExpectationRecord {
  expectation: PaymentExpectation;
  state: 'OPEN' | 'CANCELLED' | 'RECEIPT_CLAIMED';
}
interface Attempt {
  fingerprint: string;
  result: VerificationResult;
}
interface Preparation {
  input: VerificationSubmission;
  fingerprint: string;
  snapshot: string;
  url: string;
  provider: ProviderId;
  retrieved: Awaited<ReturnType<ReceiptProvider['retrieve']>> | undefined;
}
const preparations = new WeakMap<PreparedVerification, Preparation>();
export class VerificationError extends Error {
  readonly code:
    | 'NOT_FOUND'
    | 'INVALID_INPUT'
    | 'CORRUPT_STATE'
    | 'EXPECTATION_EXISTS'
    | 'INVALID_PREPARATION';
  constructor(code: VerificationError['code']) {
    super(code);
    this.name = 'VerificationError';
    this.code = code;
  }
}
export function storageKey(kind: string, ...parts: string[]): string {
  if (!/^[a-z]{1,12}$/.test(kind)) throw new TypeError('Invalid record kind');
  return `rv1:${kind}:${createHash('sha256').update(JSON.stringify(parts)).digest('hex')}`;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new VerificationError('CORRUPT_STATE');
  return value as Record<string, unknown>;
}
function identifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= 128 &&
    value.trim() === value &&
    Array.from(value).every((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)
  );
}
function scopeKey(scope: PaymentScope): string {
  if (!identifier(scope.tenantId) || !identifier(scope.paymentId))
    throw new VerificationError('INVALID_INPUT');
  return storageKey('expectation', scope.tenantId, scope.paymentId);
}
function expectationRecord(value: unknown, scope: PaymentScope): ExpectationRecord {
  if (value === undefined) throw new VerificationError('NOT_FOUND');
  const v = object(value);
  let expectation: PaymentExpectation;
  try {
    expectation = createPaymentExpectation(v.expectation);
  } catch {
    throw new VerificationError('CORRUPT_STATE');
  }
  if (
    expectation.tenantId !== scope.tenantId ||
    expectation.paymentId !== scope.paymentId ||
    (v.state !== 'OPEN' && v.state !== 'CANCELLED' && v.state !== 'RECEIPT_CLAIMED')
  )
    throw new VerificationError('CORRUPT_STATE');
  return { expectation, state: v.state };
}
function attempt(value: unknown, tenantId: string, idempotencyKey: string): Attempt | undefined {
  if (value === undefined) return undefined;
  const v = object(value),
    result = object(v.result);
  if (
    typeof v.fingerprint !== 'string' ||
    result.settlementStatus !== 'UNCONFIRMED' ||
    typeof result.verificationStatus !== 'string' ||
    ![
      'MATCHED_RECEIPT_ONLY',
      'MISMATCHED',
      'UNABLE_TO_VERIFY',
      'ALREADY_CLAIMED',
      'CANCELLED',
      'EXPIRED',
      'NEEDS_REVIEW',
    ].includes(result.verificationStatus) ||
    result.tenantId !== tenantId ||
    !identifier(result.paymentId) ||
    result.verificationId !== storageKey('verification', tenantId, idempotencyKey)
  )
    throw new VerificationError('CORRUPT_STATE');
  const rawChecks = object(result.checks);
  if (
    Object.values(rawChecks).some(
      (c) => !['PASS', 'FAIL', 'MISSING', 'INVALID', 'AMBIGUOUS'].includes(c as string),
    )
  )
    throw new VerificationError('CORRUPT_STATE');
  return {
    fingerprint: v.fingerprint,
    result: {
      tenantId,
      paymentId: result.paymentId,
      verificationId: result.verificationId,
      verificationStatus: result.verificationStatus as VerificationResult['verificationStatus'],
      settlementStatus: 'UNCONFIRMED',
      checks: rawChecks as VerificationResult['checks'],
    },
  };
}

/** Providers are trusted host configuration. Public submissions supply only a locator and IDs. */
export function createReceiptVerifier(config: {
  readonly storage: VerificationStorage;
  readonly providers: Readonly<Partial<Record<ProviderId, ReceiptProvider>>>;
  readonly now?: () => number;
}): ReceiptVerifier {
  const { storage } = config;
  const now = (): number => {
    const value = (config.now ?? Date.now)();
    if (!Number.isSafeInteger(value) || value < 0) throw new VerificationError('INVALID_INPUT');
    return value;
  };
  const verifier: ReceiptVerifier = {
    async registerExpectation(value) {
      const expectation = createPaymentExpectation(value),
        key = scopeKey(expectation);
      await storage.transaction(async (tx) => {
        const existing = await tx.get(key);
        if (existing !== undefined) {
          if (
            JSON.stringify(expectationRecord(existing, expectation).expectation) !==
            JSON.stringify(expectation)
          )
            throw new VerificationError('EXPECTATION_EXISTS');
          return;
        }
        await tx.insert(key, { expectation, state: 'OPEN' });
      });
    },
    async cancelExpectation(scope) {
      const key = scopeKey(scope);
      await storage.transaction(async (tx) => {
        const stored = expectationRecord(await tx.get(key), scope);
        if (stored.state === 'OPEN') await tx.set(key, { ...stored, state: 'CANCELLED' });
      });
    },
    async prepare(source, options) {
      if (storage.callerTransaction) throw new VerificationError('INVALID_INPUT');
      const input = {
        tenantId: source.tenantId,
        paymentId: source.paymentId,
        idempotencyKey: source.idempotencyKey,
        receiptLocator: source.receiptLocator,
      };
      if (!identifier(input.idempotencyKey)) throw new VerificationError('INVALID_INPUT');
      const stored = expectationRecord(await storage.read(scopeKey(input)), input);
      let locator: ReturnType<typeof normalizeReceiptLocator>;
      try {
        locator = normalizeReceiptLocator(stored.expectation.provider, input.receiptLocator);
      } catch {
        throw new VerificationError('INVALID_INPUT');
      }
      const fingerprint = storageKey('input', input.paymentId, locator.provider, locator.url);
      const existing = attempt(
        await storage.read(storageKey('attempt', input.tenantId, input.idempotencyKey)),
        input.tenantId,
        input.idempotencyKey,
      );
      let retrieved: Preparation['retrieved'];
      if (!existing && stored.state === 'OPEN' && now() <= stored.expectation.validUntil) {
        const provider = config.providers[locator.provider];
        try {
          retrieved = provider
            ? await provider.retrieve(locator.url, options)
            : { kind: 'UNAVAILABLE', code: 'PROVIDER_UNAVAILABLE' };
        } catch {
          retrieved = { kind: 'UNAVAILABLE', code: 'PROVIDER_UNAVAILABLE' };
        }
      }
      if (retrieved) {
        try {
          const serialized = JSON.stringify(retrieved);
          if (Buffer.byteLength(serialized) > 16_000) throw new Error('Oversized evidence');
          retrieved = JSON.parse(serialized) as Preparation['retrieved'];
          if (retrieved?.kind === 'EVIDENCE') {
            const p = object(retrieved.provenance);
            object(retrieved.evidence);
            if (
              p.kind !== 'OFFICIAL_HTTPS' ||
              p.url !== locator.url ||
              typeof p.sha256 !== 'string' ||
              !/^[a-f0-9]{64}$/.test(p.sha256) ||
              !Number.isSafeInteger(p.retrievedAt) ||
              p.parserVersion !== '1'
            )
              throw new Error('Invalid provenance');
          } else if (retrieved?.kind !== 'UNAVAILABLE') throw new Error('Invalid provider result');
        } catch {
          retrieved = { kind: 'UNAVAILABLE', code: 'INVALID_RESPONSE' };
        }
      }
      const token = Object.freeze({}) as PreparedVerification;
      preparations.set(token, {
        input,
        fingerprint,
        snapshot: JSON.stringify(stored.expectation),
        url: locator.url,
        provider: locator.provider,
        retrieved,
      });
      return token;
    },
    async complete(prepared, target = storage) {
      const data = preparations.get(prepared);
      if (!data) throw new VerificationError('INVALID_PREPARATION');
      const { input } = data;
      return target.transaction(async (tx: RecordTransaction) => {
        const key = scopeKey(input),
          stored = expectationRecord(await tx.get(key), input);
        const attemptKey = storageKey('attempt', input.tenantId, input.idempotencyKey);
        const previous = attempt(await tx.get(attemptKey), input.tenantId, input.idempotencyKey);
        const base = {
          tenantId: input.tenantId,
          paymentId: input.paymentId,
          verificationId: storageKey('verification', input.tenantId, input.idempotencyKey),
          settlementStatus: 'UNCONFIRMED' as const,
        };
        if (previous) {
          if (previous.fingerprint === data.fingerprint) {
            if (previous.result.paymentId !== input.paymentId)
              throw new VerificationError('CORRUPT_STATE');
            return previous.result;
          }
          return { ...base, verificationStatus: 'IDEMPOTENCY_CONFLICT', checks: {} };
        }
        let verificationStatus: VerificationResult['verificationStatus'] = 'UNABLE_TO_VERIFY';
        let checks: VerificationResult['checks'] = {};
        const fetched = data.retrieved;
        if (JSON.stringify(stored.expectation) !== data.snapshot)
          verificationStatus = 'NEEDS_REVIEW';
        else if (stored.state === 'CANCELLED') verificationStatus = 'CANCELLED';
        else if (now() > stored.expectation.validUntil) verificationStatus = 'EXPIRED';
        else if (now() < stored.expectation.validFrom) verificationStatus = 'UNABLE_TO_VERIFY';
        else if (stored.state === 'RECEIPT_CLAIMED') verificationStatus = 'ALREADY_CLAIMED';
        else if (
          fetched?.kind === 'EVIDENCE' &&
          fetched.provenance.kind === 'OFFICIAL_HTTPS' &&
          fetched.provenance.url === data.url &&
          /^[a-f0-9]{64}$/.test(fetched.provenance.sha256)
        ) {
          const compared = compareReceipt(stored.expectation, fetched.evidence);
          verificationStatus = compared.verificationStatus;
          checks = compared.checks;
          if (verificationStatus === 'MATCHED_RECEIPT_ONLY') {
            const claimKey = storageKey('claim', data.provider, fetched.evidence.transactionId!);
            if ((await tx.get(claimKey)) !== undefined) verificationStatus = 'ALREADY_CLAIMED';
            else {
              await tx.insert(claimKey, {
                tenantId: input.tenantId,
                paymentId: input.paymentId,
                verificationId: base.verificationId,
              });
              await tx.set(key, { ...stored, state: 'RECEIPT_CLAIMED' });
            }
          }
        }
        const result: VerificationResult = { ...base, verificationStatus, checks };
        // Store normalized fields and a source hash, never raw HTML or the receipt URL.
        const evidence = fetched?.kind === 'EVIDENCE' ? fetched.evidence : null;
        const provenance =
          fetched?.kind === 'EVIDENCE'
            ? {
                sha256: fetched.provenance.sha256,
                retrievedAt: fetched.provenance.retrievedAt,
                parserVersion: fetched.provenance.parserVersion,
              }
            : null;
        await tx.insert(attemptKey, {
          fingerprint: data.fingerprint,
          result,
          evidence,
          provenance,
        });
        await tx.insert(storageKey('event', base.verificationId), {
          type: 'receipt.verification.completed',
          result,
          createdAt: now(),
        });
        return result;
      });
    },
    async submit(input, options) {
      return verifier.complete(await verifier.prepare(input, options));
    },
    async events(limit = 100) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000)
        throw new VerificationError('INVALID_INPUT');
      return storage.transaction((tx) => tx.scan('rv1:event:', limit));
    },
    async acknowledgeEvent(key) {
      if (!/^rv1:event:[a-f0-9]{64}$/.test(key)) throw new VerificationError('INVALID_INPUT');
      await storage.transaction((tx) => tx.delete(key));
    },
  };
  return verifier;
}
