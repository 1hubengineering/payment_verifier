import { comparePaymentAmount } from './amount-policy.ts';
import type { AmountPolicy } from './amount-policy.ts';
import { createHash } from 'node:crypto';
import { createPaymentExpectation, evidenceFields, timestamp } from './comparison.ts';
import type { PaymentExpectation, ReceiptEvidence } from './comparison.ts';
import { detectPaymentInput, PAYMENT_INPUT_LIMIT } from './input.ts';
import type { DetectedPaymentInput } from './input.ts';
import { operationMessages, providerMessages, VerificationOperationError } from './outcomes.ts';
import type {
  DiagnosticDetails,
  InvalidInputResult,
  OperationErrorCode,
  OperationStage,
  ReceiptSnapshot,
  SerializedVerificationOperationError,
  VerificationResult,
} from './outcomes.ts';
import type { ProviderResult } from './providers/index.ts';
import { StorageConflict, StorageDataError } from './storage.ts';
import type { RecordTransaction, VerificationStorage } from './storage.ts';
import type { ProviderId } from './types.ts';

export interface PaymentScope {
  readonly tenantId: string;
  readonly paymentId: string;
}
export interface VerificationSubmission extends PaymentScope {
  readonly idempotencyKey: string;
  readonly receiptLocator: string;
}

export function storageKey(kind: string, ...parts: string[]): string {
  if (!/^[a-z]{1,12}$/.test(kind)) throw new TypeError('Invalid record kind');
  return `rv1:${kind}:${createHash('sha256').update(JSON.stringify(parts)).digest('hex')}`;
}

export function operation(
  code: OperationErrorCode,
  stage: OperationStage,
  cause?: unknown,
): VerificationOperationError {
  return new VerificationOperationError(code, stage, { cause });
}

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw operation('CORRUPT_STATE', 'storage');
  return value as Record<string, unknown>;
}

export function identifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= 128 &&
    value.trim() === value &&
    Array.from(value).every(
      (character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
    )
  );
}

export function scopeKey(scope: PaymentScope): string {
  if (!identifier(scope?.tenantId) || !identifier(scope?.paymentId))
    throw operation('INVALID_REQUEST', 'request');
  return storageKey('expectation', scope.tenantId, scope.paymentId);
}

export function submission(source: VerificationSubmission): VerificationSubmission {
  scopeKey(source);
  if (!identifier(source.idempotencyKey) || typeof source.receiptLocator !== 'string')
    throw operation('INVALID_REQUEST', 'request');
  return {
    tenantId: source.tenantId,
    paymentId: source.paymentId,
    idempotencyKey: source.idempotencyKey,
    receiptLocator: source.receiptLocator,
  };
}

export const payloadVersion = 2;
const formatKey = storageKey('format', 'verification');
export async function ensureStore(tx: RecordTransaction): Promise<void> {
  const format = await tx.get(formatKey);
  if (format === payloadVersion) return;
  if (format !== undefined) throw operation('INCOMPATIBLE_STORE', 'storage');
  for (const kind of [
    'expectation',
    'attempt',
    'claim',
    'job',
    'jobcontrol',
    'jobalias',
    'jobhistory',
    'event',
  ]) {
    if ((await tx.scan(`rv1:${kind}:`, 1)).length) throw operation('INCOMPATIBLE_STORE', 'storage');
  }
  await tx.insert(formatKey, payloadVersion);
}

export interface ExpectationRecord {
  readonly version: typeof payloadVersion;
  readonly expectation: PaymentExpectation;
  readonly state: 'OPEN' | 'CANCELLED' | 'RECEIPT_CLAIMED';
}
export function expectationRecord(value: unknown, scope: PaymentScope): ExpectationRecord {
  if (value === undefined) throw operation('EXPECTATION_NOT_FOUND', 'expectation');
  const v = object(value);
  if (v.version !== payloadVersion) throw operation('INCOMPATIBLE_STORE', 'storage');
  let expectation: PaymentExpectation;
  try {
    expectation = createPaymentExpectation(v.expectation);
  } catch (cause) {
    throw operation('CORRUPT_STATE', 'storage', cause);
  }
  if (
    expectation.tenantId !== scope.tenantId ||
    expectation.paymentId !== scope.paymentId ||
    (v.state !== 'OPEN' && v.state !== 'CANCELLED' && v.state !== 'RECEIPT_CLAIMED')
  )
    throw operation('CORRUPT_STATE', 'storage');
  return { version: payloadVersion, expectation, state: v.state };
}

export function requireOpen(record: ExpectationRecord, time: number): void {
  if (record.state === 'CANCELLED') throw operation('EXPECTATION_CANCELLED', 'expectation');
  if (record.state === 'RECEIPT_CLAIMED') throw operation('RECEIPT_ALREADY_CLAIMED', 'completion');
  if (time > record.expectation.validUntil) throw operation('EXPECTATION_EXPIRED', 'expectation');
  if (time < record.expectation.validFrom)
    throw operation('EXPECTATION_NOT_YET_VALID', 'expectation');
}

export function detectSubmission(
  input: VerificationSubmission,
  expectedProvider: ProviderId,
): DetectedPaymentInput | InvalidInputResult {
  const parsed = detectPaymentInput(input.receiptLocator);
  if (parsed.ok && parsed.value.provider === expectedProvider) return parsed.value;
  const common = {
    verificationId: null,
    tenantId: input.tenantId,
    paymentId: input.paymentId,
    expectedProvider,
    checks: [],
    receipt: null,
    source: null,
    verified: false,
    status: 'INVALID_INPUT',
    retryable: false,
  } as const;
  if (!parsed.ok) return { ...common, input: null, stage: 'input_parsing', ...parsed.error };
  return {
    ...common,
    input: parsed.value,
    stage: 'input_validation',
    code: 'PROVIDER_MISMATCH',
    message: 'The payment input belongs to a different provider than the expected provider.',
    details: { expectedProvider, detectedProvider: parsed.value.provider },
  };
}

export function canonicalFingerprint(input: PaymentScope, detected: DetectedPaymentInput): string {
  return storageKey('input', input.paymentId, detected.provider, detected.identifier);
}

export interface StoredAttempt {
  readonly fingerprint: string;
  readonly result: VerificationResult;
}
export function attemptRecord(
  value: unknown,
  input: VerificationSubmission,
): StoredAttempt | undefined {
  if (value === undefined) return undefined;
  const row = object(value);
  if (row.version !== payloadVersion) throw operation('INCOMPATIBLE_STORE', 'storage');
  const { fingerprint, result } = row;
  const paymentId = object(result).paymentId;
  if (
    typeof fingerprint !== 'string' ||
    !/^rv1:input:[a-f0-9]{64}$/.test(fingerprint) ||
    !identifier(paymentId)
  )
    throw operation('CORRUPT_STATE', 'storage');
  const decoded = resultRecord(result, { tenantId: input.tenantId, paymentId });
  if (decoded.verificationId !== storageKey('verification', input.tenantId, input.idempotencyKey))
    throw operation('CORRUPT_STATE', 'storage');
  return { fingerprint, result: decoded };
}

export function replayAttempt(
  attempt: StoredAttempt,
  input: VerificationSubmission,
  fingerprint: string,
): VerificationResult {
  if (attempt.fingerprint !== fingerprint || attempt.result.paymentId !== input.paymentId)
    throw operation('IDEMPOTENCY_CONFLICT', 'idempotency');
  return attempt.result;
}

export async function replayJobBinding(
  read: (key: string) => Promise<unknown>,
  input: VerificationSubmission,
  fingerprint: string,
  workerJobId?: string,
): Promise<VerificationResult | undefined> {
  const bound = await read(storageKey('jobalias', input.tenantId, input.idempotencyKey));
  if (bound === undefined) {
    if (workerJobId !== undefined) throw operation('CORRUPT_STATE', 'storage');
    return undefined;
  }
  const alias = object(bound);
  if (alias.fingerprint !== fingerprint) throw operation('IDEMPOTENCY_CONFLICT', 'idempotency');
  if (typeof alias.jobId !== 'string' || !/^rv1:job:[a-f0-9]{64}$/.test(alias.jobId))
    throw operation('CORRUPT_STATE', 'storage');
  if (workerJobId === alias.jobId) return undefined;
  const job = object(
    (await read(alias.jobId)) ?? (await read(storageKey('jobhistory', alias.jobId))),
  );
  if (
    job.version !== payloadVersion ||
    job.jobId !== alias.jobId ||
    job.fingerprint !== fingerprint ||
    job.tenantId !== input.tenantId ||
    job.paymentId !== input.paymentId
  )
    throw operation('CORRUPT_STATE', 'storage');
  if (job.state === 'COMPLETED') return resultRecord(job.result, input);
  if (job.state === 'FAILED') {
    const error = serializedError(job.error);
    throw new VerificationOperationError(error.code, error.stage, {
      retryable: error.retryable,
      details: error.details,
    });
  }
  throw operation('JOB_IN_PROGRESS', 'idempotency');
}

export async function readRecord(storage: VerificationStorage, key: string): Promise<unknown> {
  try {
    return await storage.read(key);
  } catch (cause) {
    throw operation(
      cause instanceof StorageDataError ? 'CORRUPT_STATE' : 'STORAGE_FAILURE',
      'storage',
      cause,
    );
  }
}

export async function transact<T>(
  storage: VerificationStorage,
  work: (tx: RecordTransaction) => Promise<T>,
): Promise<T> {
  let readyToCommit = false;
  try {
    return await storage.transaction(async (tx) => {
      readyToCommit = false;
      const result = await work(tx);
      readyToCommit = true;
      return result;
    });
  } catch (cause) {
    if (cause instanceof VerificationOperationError) throw cause;
    // Caller-owned scopes must still abort or retry the entire outer transaction.
    if (cause instanceof StorageConflict)
      throw new VerificationOperationError('STORAGE_FAILURE', 'storage', {
        cause,
        retryable: true,
      });
    if (cause instanceof StorageDataError) throw operation('CORRUPT_STATE', 'storage', cause);
    throw operation(
      readyToCommit && !storage.callerTransaction ? 'STORAGE_OUTCOME_UNKNOWN' : 'STORAGE_FAILURE',
      'storage',
      cause,
    );
  }
}

const stages = ['receipt_retrieval', 'receipt_rendering', 'receipt_parsing'] as const;
const paymentStatuses = ['SUCCESSFUL', 'PENDING', 'FAILED', 'REVERSED', 'CANCELLED'] as const;
const inputTypes = ['identifier', 'receipt_url', 'sms'] as const;
const hex = /^[0-9a-f]{64}$/;
const statusNames = ['VERIFIED', 'MISMATCH', 'NOT_FOUND', 'UNAVAILABLE', 'INVALID_INPUT'];
const fieldNames = [
  'provider',
  'transactionId',
  'paymentStatus',
  'amountMinor',
  'currency',
  'recipientName',
  'recipientAccount',
  'invoiceReference',
  'transactionTime',
  'paymentType',
];

function boundedText(x: unknown, max = 256): x is string {
  return typeof x === 'string' && x.length > 0 && x.length <= max;
}
function known(items: readonly string[], value: unknown): boolean {
  return typeof value === 'string' && items.includes(value);
}
function validInteger(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}

function diagnostics(value: unknown): DiagnosticDetails {
  if (value === undefined) return {};
  const input = object(value);
  const result: Record<string, string | number> = {};
  for (const [key, min, max] of [
    ['httpStatus', 100, 599],
    ['timeoutMs', 1, 60_000],
    ['retryAfterMs', 0, 60_000],
  ] as const) {
    if (input[key] === undefined) continue;
    if (!validInteger(input[key], min, max)) throw new TypeError('Invalid provider diagnostic');
    result[key] = input[key];
  }
  if (input.transportCode !== undefined) {
    if (
      typeof input.transportCode !== 'string' ||
      !/^[A-Z][A-Z0-9_]{1,47}$/.test(input.transportCode)
    )
      throw new TypeError('Invalid transport diagnostic');
    result.transportCode = input.transportCode;
  }
  return result;
}

function normalizeEvidence(value: unknown): ReceiptEvidence {
  const raw = object(value);
  const fieldList = (entry: unknown): ReceiptEvidence['ambiguousFields'] => {
    if (
      !Array.isArray(entry) ||
      entry.length > evidenceFields.length ||
      Array.from(entry).some((f) => !evidenceFields.includes(f))
    )
      throw new TypeError('Invalid evidence field list');
    return [...new Set(entry)] as ReceiptEvidence['ambiguousFields'];
  };
  const strings = [
    'currency',
    'transactionId',
    'recipientName',
    'recipientAccountLast4',
    'reference',
    'paymentType',
  ] as const;
  for (const field of strings) {
    if (raw[field] !== null && !boundedText(raw[field]))
      throw new TypeError('Invalid evidence value');
  }
  if (
    (raw.provider !== null && raw.provider !== 'telebirr' && raw.provider !== 'cbe') ||
    (raw.status !== null && !known(paymentStatuses, raw.status)) ||
    (raw.transactionAt !== null && !timestamp(raw.transactionAt)) ||
    (raw.amountMinor !== null && !validInteger(raw.amountMinor, 1, Number.MAX_SAFE_INTEGER))
  )
    throw new TypeError('Invalid evidence value');
  return {
    provider: raw.provider,
    currency: raw.currency as ReceiptEvidence['currency'],
    transactionId: raw.transactionId as ReceiptEvidence['transactionId'],
    status: raw.status as ReceiptEvidence['status'],
    amountMinor: raw.amountMinor as ReceiptEvidence['amountMinor'],
    recipientName: raw.recipientName as ReceiptEvidence['recipientName'],
    recipientAccountLast4: raw.recipientAccountLast4 as ReceiptEvidence['recipientAccountLast4'],
    reference: raw.reference as ReceiptEvidence['reference'],
    transactionAt: raw.transactionAt as ReceiptEvidence['transactionAt'],
    paymentType: raw.paymentType as ReceiptEvidence['paymentType'],
    ambiguousFields: fieldList(raw.ambiguousFields),
    ...(raw.invalidFields === undefined ? {} : { invalidFields: fieldList(raw.invalidFields) }),
  };
}

export function normalizeProviderResult(value: unknown, url: string): ProviderResult {
  try {
    const v = object(value);
    if (
      v.kind === 'UNAVAILABLE' &&
      typeof v.code === 'string' &&
      Object.hasOwn(providerMessages, v.code) &&
      known(stages, v.stage) &&
      typeof v.retryable === 'boolean'
    )
      return {
        kind: 'UNAVAILABLE',
        code: v.code as keyof typeof providerMessages,
        stage: v.stage as (typeof stages)[number],
        retryable: v.retryable,
        details: diagnostics(v.details),
      };
    if (v.kind === 'NOT_FOUND' && (v.retryable === undefined || typeof v.retryable === 'boolean'))
      return {
        kind: 'NOT_FOUND',
        retryable: v.retryable ?? false,
        details: diagnostics(v.details),
      };
    if (v.kind === 'EVIDENCE') {
      const p = object(v.provenance);
      if (
        p.kind === 'OFFICIAL_HTTPS' &&
        p.url === url &&
        typeof p.sha256 === 'string' &&
        hex.test(p.sha256) &&
        timestamp(p.retrievedAt) &&
        boundedText(p.parserVersion, 32) &&
        /^[a-z0-9._-]+$/i.test(p.parserVersion) &&
        (v.pendingRetryable === undefined || typeof v.pendingRetryable === 'boolean')
      )
        return {
          kind: 'EVIDENCE',
          evidence: normalizeEvidence(v.evidence),
          pendingRetryable: v.pendingRetryable ?? false,
          provenance: {
            kind: 'OFFICIAL_HTTPS',
            url,
            sha256: p.sha256,
            retrievedAt: p.retrievedAt,
            parserVersion: p.parserVersion,
          },
        };
    }
    throw new TypeError('Invalid provider outcome');
  } catch (cause) {
    throw operation('INVALID_ADAPTER_RESULT', 'adapter', cause);
  }
}

export function receiptSnapshot(evidence: ReceiptEvidence): ReceiptSnapshot {
  const { invalidFields = [], ambiguousFields } = evidence;
  const reliable = <K extends (typeof evidenceFields)[number]>(
    field: K,
  ): ReceiptEvidence[K] | null =>
    invalidFields.includes(field) || ambiguousFields.includes(field) ? null : evidence[field];
  const account = reliable('recipientAccountLast4');
  const time = reliable('transactionAt');
  const id = reliable('transactionId');
  const currency = reliable('currency');
  return {
    provider: reliable('provider'),
    transactionId: id !== null && /^[A-Z0-9_-]{6,40}$/.test(id) ? id : null,
    paymentStatus: reliable('status'),
    amountMinor: reliable('amountMinor'),
    currency: currency !== null && /^[A-Z]{3}$/.test(currency) ? currency : null,
    recipientName: reliable('recipientName'),
    recipientAccount:
      account !== null && /^\d{4}$/.test(account)
        ? { representation: 'LAST4', value: account }
        : null,
    invoiceReference: reliable('reference'),
    transactionAt: time === null ? null : new Date(time).toISOString(),
    paymentType: reliable('paymentType'),
  };
}

function storedInput(value: unknown): boolean {
  const v = object(value);
  if (
    !onlyKeys(v, ['provider', 'inputType', 'identifierKind', 'identifier']) ||
    !boundedText(v.identifier, 515) ||
    !known(inputTypes, v.inputType)
  )
    return false;
  const parsed = detectPaymentInput(v.identifier);
  return (
    parsed.ok &&
    parsed.value.identifier === v.identifier &&
    parsed.value.provider === v.provider &&
    parsed.value.identifierKind === v.identifierKind
  );
}

function validJson(value: unknown, depth = 0): boolean {
  if (
    value === null ||
    typeof value === 'boolean' ||
    boundedText(value, PAYMENT_INPUT_LIMIT) ||
    (typeof value === 'number' && Number.isSafeInteger(value))
  )
    return true;
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth >= 2) return false;
  const entries = Object.entries(value);
  return (
    entries.length <= 8 &&
    entries.every(
      ([key, item]) => /^[a-zA-Z][a-zA-Z0-9]{0,31}$/.test(key) && validJson(item, depth + 1),
    )
  );
}

const checkFields = {
  provider: ['RECEIPT_PROVIDER_MISMATCH'],
  transactionId: ['TRANSACTION_ID_MISMATCH'],
  paymentStatus: ['PAYMENT_PENDING', 'PAYMENT_FAILED', 'PAYMENT_REVERSED', 'PAYMENT_CANCELLED'],
  currency: ['CURRENCY_MISMATCH'],
  recipientName: ['RECIPIENT_NAME_MISMATCH'],
  recipientAccount: ['RECIPIENT_ACCOUNT_MISMATCH'],
  invoiceReference: ['INVOICE_REFERENCE_MISMATCH'],
  transactionTime: ['PAYMENT_TIME_OUT_OF_RANGE'],
  paymentType: ['PAYMENT_TYPE_MISMATCH'],
} as const;
function onlyKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(record).every((key) => keys.includes(key));
}
function validAmountCheck(v: Record<string, unknown>): boolean {
  if (
    !validInteger(v.expected, 1, Number.MAX_SAFE_INTEGER) ||
    !(v.actual === null || validInteger(v.actual, 1, Number.MAX_SAFE_INTEGER)) ||
    v.required !== true ||
    !onlyKeys(v, ['field', 'rule', 'expected', 'actual', 'required', 'status', 'code', 'details'])
  )
    return false;
  const details = object(v.details);
  try {
    const computed = comparePaymentAmount(v.expected, v.actual, details.policy as AmountPolicy);
    const status = v.status;
    const evidenceCode =
      status === 'AMBIGUOUS'
        ? 'AMBIGUOUS_RECEIPT_FIELD'
        : status === 'INVALID'
          ? 'INVALID_RECEIPT_FIELD'
          : null;
    return (
      v.rule === computed.rule &&
      onlyKeys(details, Object.keys(computed.details)) &&
      JSON.stringify(details.policy) === JSON.stringify(computed.details.policy) &&
      Object.entries(computed.details).every(
        ([key, entry]) => key === 'policy' || details[key] === entry,
      ) &&
      (evidenceCode === null
        ? status === computed.status && v.code === computed.code
        : v.actual === null && v.code === evidenceCode)
    );
  } catch {
    return false;
  }
}
function validCheck(value: unknown): boolean {
  const v = object(value);
  if (v.field === 'amountMinor') return validAmountCheck(v);
  const codes = {
    PASS: null,
    SKIPPED: 'CHECK_DISABLED',
    MISSING: 'REQUIRED_FIELD_MISSING',
    INVALID: 'INVALID_RECEIPT_FIELD',
    AMBIGUOUS: 'AMBIGUOUS_RECEIPT_FIELD',
  };
  if (
    typeof v.field !== 'string' ||
    !Object.hasOwn(checkFields, v.field) ||
    !onlyKeys(v, ['field', 'rule', 'expected', 'actual', 'required', 'status', 'code']) ||
    !known(
      [
        'exact',
        'normalized_name',
        'account_last4',
        'successful_status',
        'present_identifier',
        'time_window',
      ],
      v.rule,
    ) ||
    (v.expected !== undefined && !validJson(v.expected)) ||
    (v.actual !== undefined && !validJson(v.actual))
  )
    return false;
  if (v.status === 'FAIL')
    return v.required === true && known(checkFields[v.field as keyof typeof checkFields], v.code);
  return (
    typeof v.status === 'string' &&
    Object.hasOwn(codes, v.status) &&
    v.code === codes[v.status as keyof typeof codes] &&
    v.required === (v.status !== 'SKIPPED')
  );
}

function sourceAndReceipt(value: Record<string, unknown>): boolean {
  if (!value.source || !value.receipt) return false;
  const s = object(value.source);
  const r = object(value.receipt);
  if (
    !onlyKeys(s, ['kind', 'retrievedAt', 'parserVersion', 'contentHash']) ||
    !onlyKeys(r, [
      'provider',
      'transactionId',
      'paymentStatus',
      'amountMinor',
      'currency',
      'recipientName',
      'recipientAccount',
      'invoiceReference',
      'transactionAt',
      'paymentType',
    ]) ||
    s.kind !== 'OFFICIAL_RECEIPT' ||
    !boundedText(s.retrievedAt, 27) ||
    !Number.isFinite(Date.parse(s.retrievedAt)) ||
    !boundedText(s.contentHash, 64) ||
    !hex.test(s.contentHash) ||
    !boundedText(s.parserVersion, 32)
  )
    return false;
  if (
    (r.provider !== null && !known(['cbe', 'telebirr'], r.provider)) ||
    (r.paymentStatus !== null && !known(paymentStatuses, r.paymentStatus)) ||
    (r.amountMinor !== null && !validInteger(r.amountMinor, 1, Number.MAX_SAFE_INTEGER))
  )
    return false;
  for (const field of [
    'transactionId',
    'currency',
    'recipientName',
    'invoiceReference',
    'transactionAt',
    'paymentType',
  ])
    if (r[field] !== null && !boundedText(r[field])) return false;
  if (r.recipientAccount !== null) {
    const account = object(r.recipientAccount);
    if (
      !onlyKeys(account, ['representation', 'value']) ||
      account.representation !== 'LAST4' ||
      typeof account.value !== 'string' ||
      !/^\d{4}$/.test(account.value)
    )
      return false;
  }
  return true;
}

export function resultRecord(value: unknown, scope: PaymentScope): VerificationResult {
  const v = object(value);
  if (
    !onlyKeys(v, [
      'tenantId',
      'paymentId',
      'verificationId',
      'expectedProvider',
      'input',
      'message',
      'checks',
      'details',
      'receipt',
      'source',
      'verified',
      'status',
      'code',
      'stage',
      'retryable',
    ]) ||
    v.tenantId !== scope.tenantId ||
    v.paymentId !== scope.paymentId ||
    !(v.verificationId === null || boundedText(v.verificationId, 96)) ||
    !known(['cbe', 'telebirr'], v.expectedProvider) ||
    !known(statusNames, v.status) ||
    v.verified !== (v.status === 'VERIFIED') ||
    !boundedText(v.message, 256) ||
    !boundedText(v.code, 48) ||
    !validJson(v.details) ||
    typeof v.retryable !== 'boolean' ||
    !Array.isArray(v.checks) ||
    v.checks.length > fieldNames.length ||
    !Array.from(v.checks).every(validCheck) ||
    new Set(v.checks.map((entry) => object(entry).field)).size !== v.checks.length ||
    (v.input !== null && !storedInput(v.input))
  )
    throw operation('CORRUPT_STATE', 'storage');

  if (v.status === 'INVALID_INPUT') {
    if (
      v.receipt !== null ||
      v.source !== null ||
      v.retryable ||
      v.checks.length ||
      (v.code === 'PROVIDER_MISMATCH'
        ? v.stage !== 'input_validation' ||
          v.input === null ||
          object(v.input).provider === v.expectedProvider
        : v.stage !== 'input_parsing' ||
          v.input !== null ||
          !known(
            [
              'EMPTY_INPUT',
              'INPUT_TOO_LONG',
              'UNRECOGNIZED_INPUT',
              'INVALID_IDENTIFIER',
              'AMBIGUOUS_INPUT',
              'UNSUPPORTED_RECEIPT_URL',
            ],
            v.code,
          ))
    )
      throw operation('CORRUPT_STATE', 'storage');
  } else {
    if (
      v.verificationId === null ||
      v.input === null ||
      object(v.input).provider !== v.expectedProvider
    )
      throw operation('CORRUPT_STATE', 'storage');
    const comparison = v.stage === 'comparison' || v.status === 'VERIFIED';
    if (
      comparison
        ? !sourceAndReceipt(v) || v.checks.length !== fieldNames.length
        : v.source !== null || v.receipt !== null || v.checks.length
    )
      throw operation('CORRUPT_STATE', 'storage');
    const findings = v.checks.map(object);
    if (
      comparison &&
      findings.some(
        (check) =>
          (check.status === 'SKIPPED') !==
          (check.field === 'paymentType' && v.expectedProvider === 'telebirr'),
      )
    )
      throw operation('CORRUPT_STATE', 'storage');
    if (
      comparison &&
      findings.find((check) => check.field === 'amountMinor')?.actual !==
        object(v.receipt).amountMinor
    )
      throw operation('CORRUPT_STATE', 'storage');
    if (v.status === 'VERIFIED') {
      const receipt = object(v.receipt);
      if (
        v.code !== 'PAYMENT_VERIFIED' ||
        v.stage !== 'completion' ||
        v.retryable ||
        receipt.provider !== v.expectedProvider ||
        receipt.paymentStatus !== 'SUCCESSFUL' ||
        !boundedText(receipt.transactionId, 40) ||
        receipt.amountMinor === null ||
        receipt.currency !== 'ETB' ||
        v.checks.some((entry) => !known(['PASS', 'SKIPPED'], object(entry).status))
      )
        throw operation('CORRUPT_STATE', 'storage');
    } else if (v.status === 'MISMATCH') {
      const failed = findings.filter((entry) => entry.status === 'FAIL');
      if (
        v.stage !== 'comparison' ||
        !failed.length ||
        v.code !== (failed.length === 1 ? failed[0]!.code : 'MULTIPLE_MISMATCHES')
      )
        throw operation('CORRUPT_STATE', 'storage');
    } else if (v.status === 'NOT_FOUND') {
      if (v.stage !== 'receipt_retrieval' || v.code !== 'RECEIPT_NOT_FOUND')
        throw operation('CORRUPT_STATE', 'storage');
    } else if (
      v.stage === 'comparison'
        ? !known(
            [
              'REQUIRED_FIELD_MISSING',
              'INVALID_RECEIPT_FIELD',
              'AMBIGUOUS_RECEIPT_FIELD',
              'MULTIPLE_VERIFICATION_ISSUES',
            ],
            v.code,
          )
        : !known(stages, v.stage) || !Object.hasOwn(providerMessages, v.code)
    )
      throw operation('CORRUPT_STATE', 'storage');
  }
  return v as unknown as VerificationResult;
}

export function serializedError(value: unknown): SerializedVerificationOperationError {
  const v = object(value);
  if (
    !onlyKeys(v, ['type', 'code', 'stage', 'message', 'retryable', 'details']) ||
    v.type !== 'VERIFICATION_OPERATION_ERROR' ||
    typeof v.code !== 'string' ||
    !Object.hasOwn(operationMessages, v.code) ||
    !known(
      [
        'request',
        'expectation',
        'idempotency',
        'provider_configuration',
        'adapter',
        'completion',
        'storage',
        'queue',
      ],
      v.stage,
    ) ||
    !boundedText(v.message) ||
    typeof v.retryable !== 'boolean' ||
    !validJson(v.details)
  )
    throw operation('CORRUPT_STATE', 'storage');
  return v as unknown as SerializedVerificationOperationError;
}
