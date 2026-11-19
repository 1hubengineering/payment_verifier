import { amountRange, comparePaymentAmount } from './amount-policy.ts';
import type { AmountPolicy } from './amount-policy.ts';
import { cbeIdentifier, telebirrIdentifier } from './input-syntax.ts';
import type { EtbMinorUnits } from './money.ts';
import type { JsonValue, ProviderId } from './types.ts';
import type {
  CheckField,
  CheckRule,
  IncompleteEvidenceCode,
  MismatchCode,
  VerificationCheck,
} from './outcomes.ts';

/** Host-owned snapshot; never construct from receipt submission values. */
export interface PaymentExpectation {
  readonly tenantId: string;
  readonly paymentId: string;
  readonly provider: ProviderId;
  readonly currency: 'ETB';
  readonly amountMinor: EtbMinorUnits;
  readonly amountPolicy: AmountPolicy;
  readonly recipientName: string;
  readonly recipientAccountLast4: string;
  readonly reference: string;
  /** Set to false to allow an empty expected reference. The receipt must match it. */
  readonly referenceRequired?: boolean;
  readonly validFrom: number;
  readonly validUntil: number;
}

export type EvidenceField =
  | 'provider'
  | 'currency'
  | 'transactionId'
  | 'status'
  | 'amountMinor'
  | 'recipientName'
  | 'recipientAccountLast4'
  | 'reference'
  | 'transactionAt'
  | 'paymentType';

/** Normalized parser output, not proof of authenticity or settlement. */
export interface ReceiptEvidence {
  readonly provider: ProviderId | null;
  readonly currency: string | null;
  readonly transactionId: string | null;
  readonly status: 'SUCCESSFUL' | 'PENDING' | 'FAILED' | 'REVERSED' | 'CANCELLED' | null;
  readonly amountMinor: EtbMinorUnits | null;
  readonly recipientName: string | null;
  readonly recipientAccountLast4: string | null;
  readonly reference: string | null;
  readonly transactionAt: number | null;
  readonly paymentType: string | null;
  readonly ambiguousFields: readonly EvidenceField[];
  readonly invalidFields?: readonly EvidenceField[];
}

export type ReceiptComparison =
  | { readonly status: 'MATCH'; readonly code: null; readonly checks: readonly VerificationCheck[] }
  | {
      readonly status: 'MISMATCH';
      readonly code: MismatchCode | 'MULTIPLE_MISMATCHES';
      readonly checks: readonly VerificationCheck[];
    }
  | {
      readonly status: 'INCOMPLETE';
      readonly code: IncompleteEvidenceCode | 'MULTIPLE_VERIFICATION_ISSUES';
      readonly checks: readonly VerificationCheck[];
    };

export const evidenceFields: readonly EvidenceField[] = [
  'provider',
  'currency',
  'transactionId',
  'status',
  'amountMinor',
  'recipientName',
  'recipientAccountLast4',
  'reference',
  'transactionAt',
  'paymentType',
];

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 256;
}

export function timestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 8.64e15;
}

function amount(value: unknown): value is EtbMinorUnits {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function name(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').toLowerCase();
}

/** Validate and freeze a copy; caller mutations cannot alter the snapshot. */
export function createPaymentExpectation(
  input: unknown,
  options: { readonly defaultAmountPolicy?: AmountPolicy } = {},
): PaymentExpectation {
  const v = record(input);
  if (
    !text(v.tenantId) ||
    v.tenantId.trim() !== v.tenantId ||
    !text(v.paymentId) ||
    v.paymentId.trim() !== v.paymentId ||
    (v.provider !== 'telebirr' && v.provider !== 'cbe') ||
    v.currency !== 'ETB' ||
    !amount(v.amountMinor) ||
    !text(v.recipientName) ||
    typeof v.recipientAccountLast4 !== 'string' ||
    !/^\d{4}$/.test(v.recipientAccountLast4) ||
    typeof v.reference !== 'string' ||
    v.reference.length > 255 ||
    (v.referenceRequired !== undefined && typeof v.referenceRequired !== 'boolean') ||
    (v.reference === '' ? v.referenceRequired !== false : v.reference.trim() === '') ||
    !timestamp(v.validFrom) ||
    !timestamp(v.validUntil) ||
    v.validUntil < v.validFrom
  ) {
    throw new TypeError('Invalid trusted payment expectation');
  }
  return Object.freeze({
    tenantId: v.tenantId,
    paymentId: v.paymentId,
    provider: v.provider,
    currency: v.currency,
    amountMinor: v.amountMinor,
    amountPolicy: amountRange(
      v.amountMinor,
      v.amountPolicy === undefined ? options.defaultAmountPolicy : v.amountPolicy,
    ).policy,
    recipientName: v.recipientName,
    recipientAccountLast4: v.recipientAccountLast4,
    reference: v.reference,
    ...(v.referenceRequired === false ? { referenceRequired: false } : {}),
    validFrom: v.validFrom,
    validUntil: v.validUntil,
  });
}

function safeValue(value: unknown): JsonValue | undefined {
  if (value === null || text(value) || (typeof value === 'number' && Number.isSafeInteger(value)))
    return value;
  return undefined;
}

interface Rule {
  readonly field: Exclude<CheckField, 'amountMinor'>;
  readonly evidence: EvidenceField;
  readonly rule: CheckRule;
  readonly expected?: JsonValue;
  readonly matchBlank?: boolean;
  readonly valid: boolean;
  readonly matches: boolean;
  readonly mismatch: MismatchCode;
}

function check(rule: Rule, evidence: Record<string, unknown>): VerificationCheck {
  const { field, expected } = rule;
  const value = evidence[rule.evidence];
  const actual = safeValue(value);
  const base = {
    field,
    rule: rule.rule,
    required: true as const,
    ...(expected === undefined ? {} : { expected }),
    ...(actual === undefined || (field === 'recipientAccount' && !rule.valid) ? {} : { actual }),
  };
  if (Array.isArray(evidence.ambiguousFields) && evidence.ambiguousFields.includes(rule.evidence))
    return { ...base, status: 'AMBIGUOUS', code: 'AMBIGUOUS_RECEIPT_FIELD' };
  if (Array.isArray(evidence.invalidFields) && evidence.invalidFields.includes(rule.evidence))
    return { ...base, status: 'INVALID', code: 'INVALID_RECEIPT_FIELD' };
  if (value === null || value === undefined || value === '')
    return rule.matchBlank
      ? { ...base, status: 'PASS', code: null }
      : { ...base, status: 'MISSING', code: 'REQUIRED_FIELD_MISSING' };
  if (!rule.valid) return { ...base, status: 'INVALID', code: 'INVALID_RECEIPT_FIELD' };
  if (!rule.matches) return { ...base, status: 'FAIL', code: rule.mismatch };
  return { ...base, status: 'PASS', code: null };
}

/** Compare normalized evidence without I/O, authenticity, or claim creation. */
export function compareReceipt(
  expectation: PaymentExpectation,
  evidence: unknown,
  expectedTransactionId?: string,
): ReceiptComparison {
  const expected = createPaymentExpectation(expectation);
  if (expectedTransactionId !== undefined && !telebirrIdentifier.test(expectedTransactionId))
    throw new TypeError('Invalid expected transaction ID');
  const v = record(evidence);
  const paymentStatusCodes = {
    PENDING: 'PAYMENT_PENDING',
    FAILED: 'PAYMENT_FAILED',
    REVERSED: 'PAYMENT_REVERSED',
    CANCELLED: 'PAYMENT_CANCELLED',
  } as const;
  const failedStatus =
    typeof v.status === 'string' && Object.hasOwn(paymentStatusCodes, v.status)
      ? paymentStatusCodes[v.status as keyof typeof paymentStatusCodes]
      : undefined;
  const rules: Rule[] = [
    {
      field: 'provider',
      evidence: 'provider',
      rule: 'exact',
      expected: expected.provider,
      valid: v.provider === 'telebirr' || v.provider === 'cbe',
      matches: v.provider === expected.provider,
      mismatch: 'RECEIPT_PROVIDER_MISMATCH',
    },
    {
      field: 'transactionId',
      evidence: 'transactionId',
      rule: expectedTransactionId === undefined ? 'present_identifier' : 'exact',
      ...(expectedTransactionId === undefined ? {} : { expected: expectedTransactionId }),
      valid:
        typeof v.transactionId === 'string' &&
        /^[A-Z0-9_-]{6,40}$/.test(v.transactionId) &&
        !(expected.provider === 'cbe' && cbeIdentifier.test(v.transactionId)),
      matches: expectedTransactionId === undefined || v.transactionId === expectedTransactionId,
      mismatch: 'TRANSACTION_ID_MISMATCH',
    },
    {
      field: 'paymentStatus',
      evidence: 'status',
      rule: 'successful_status',
      expected: 'SUCCESSFUL',
      valid: v.status === 'SUCCESSFUL' || failedStatus !== undefined,
      matches: v.status === 'SUCCESSFUL',
      mismatch: failedStatus ?? 'PAYMENT_FAILED',
    },
    {
      field: 'currency',
      evidence: 'currency',
      rule: 'exact',
      expected: expected.currency,
      valid: typeof v.currency === 'string' && /^[A-Z]{3}$/.test(v.currency),
      matches: v.currency === expected.currency,
      mismatch: 'CURRENCY_MISMATCH',
    },
    {
      field: 'recipientName',
      evidence: 'recipientName',
      rule: 'normalized_name',
      expected: expected.recipientName,
      valid: text(v.recipientName),
      matches: text(v.recipientName) && name(v.recipientName) === name(expected.recipientName),
      mismatch: 'RECIPIENT_NAME_MISMATCH',
    },
    {
      field: 'recipientAccount',
      evidence: 'recipientAccountLast4',
      rule: 'account_last4',
      expected: expected.recipientAccountLast4,
      valid: typeof v.recipientAccountLast4 === 'string' && /^\d{4}$/.test(v.recipientAccountLast4),
      matches: v.recipientAccountLast4 === expected.recipientAccountLast4,
      mismatch: 'RECIPIENT_ACCOUNT_MISMATCH',
    },
    {
      field: 'invoiceReference',
      evidence: 'reference',
      rule: 'exact',
      expected: expected.reference || null,
      matchBlank: expected.referenceRequired === false && expected.reference === '',
      valid: text(v.reference),
      matches: v.reference === expected.reference,
      mismatch: 'INVOICE_REFERENCE_MISMATCH',
    },
    {
      field: 'transactionTime',
      evidence: 'transactionAt',
      rule: 'time_window',
      expected: { from: expected.validFrom, until: expected.validUntil },
      valid: timestamp(v.transactionAt),
      matches:
        timestamp(v.transactionAt) &&
        v.transactionAt >= expected.validFrom &&
        v.transactionAt <= expected.validUntil,
      mismatch: 'PAYMENT_TIME_OUT_OF_RANGE',
    },
  ];
  if (expected.provider === 'cbe')
    rules.push({
      field: 'paymentType',
      evidence: 'paymentType',
      rule: 'exact',
      expected: 'A2A',
      valid: text(v.paymentType),
      matches: v.paymentType === 'A2A',
      mismatch: 'PAYMENT_TYPE_MISMATCH',
    });
  const findings = rules.map((rule) => check(rule, v));
  const amountAmbiguous =
    Array.isArray(v.ambiguousFields) && v.ambiguousFields.includes('amountMinor');
  const amountInvalid = Array.isArray(v.invalidFields) && v.invalidFields.includes('amountMinor');
  const amountFinding = comparePaymentAmount(
    expected.amountMinor,
    amountAmbiguous || amountInvalid ? null : v.amountMinor,
    expected.amountPolicy,
  );
  findings.splice(
    3,
    0,
    amountAmbiguous
      ? { ...amountFinding, status: 'AMBIGUOUS', code: 'AMBIGUOUS_RECEIPT_FIELD' }
      : amountInvalid
        ? { ...amountFinding, status: 'INVALID', code: 'INVALID_RECEIPT_FIELD' }
        : amountFinding,
  );
  if (expected.provider === 'telebirr')
    findings.push({
      field: 'paymentType',
      rule: 'exact',
      required: false,
      status: 'SKIPPED',
      code: 'CHECK_DISABLED',
    });
  const checks = Object.freeze(findings.map((finding) => Object.freeze(finding)));
  const failures = checks.filter((c) => c.status === 'FAIL');
  if (failures.length)
    return Object.freeze({
      status: 'MISMATCH',
      code: failures.length === 1 ? failures[0]!.code : 'MULTIPLE_MISMATCHES',
      checks,
    });
  const incomplete = checks.filter(
    (c) => c.status === 'INVALID' || c.status === 'MISSING' || c.status === 'AMBIGUOUS',
  );
  const validFieldList = (entries: unknown): boolean =>
    Array.isArray(entries) &&
    Array.from(entries).every((field) => evidenceFields.includes(field as EvidenceField));
  if (
    !validFieldList(v.ambiguousFields) ||
    (v.invalidFields !== undefined && !validFieldList(v.invalidFields))
  )
    return Object.freeze({ status: 'INCOMPLETE', code: 'INVALID_RECEIPT_FIELD', checks });
  if (incomplete.length)
    return Object.freeze({
      status: 'INCOMPLETE',
      code: incomplete.length === 1 ? incomplete[0]!.code : 'MULTIPLE_VERIFICATION_ISSUES',
      checks,
    });
  return Object.freeze({ status: 'MATCH', code: null, checks });
}
