import type { EtbMinorUnits } from './money.ts';
import type { ProviderId } from './types.ts';

/** Host-owned snapshot; never construct from receipt submission values. */
export interface PaymentExpectation {
  readonly tenantId: string;
  readonly paymentId: string;
  readonly provider: ProviderId;
  readonly currency: 'ETB';
  readonly amountMinor: EtbMinorUnits;
  readonly recipientName: string;
  readonly recipientAccountLast4: string;
  readonly reference: string;
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
}

export type FieldCheck = 'PASS' | 'FAIL' | 'MISSING' | 'INVALID' | 'AMBIGUOUS';
export interface ReceiptComparison {
  readonly verificationStatus: 'MATCHED_RECEIPT_ONLY' | 'MISMATCHED' | 'UNABLE_TO_VERIFY';
  readonly settlementStatus: 'UNCONFIRMED';
  readonly checks: Readonly<Partial<Record<EvidenceField | 'integrity', FieldCheck>>>;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 256;
}

function timestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 8.64e15;
}

function amount(value: unknown): value is EtbMinorUnits {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function name(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').toLowerCase();
}

/** Validate and freeze a copy; caller mutations cannot alter the snapshot. */
export function createPaymentExpectation(input: unknown): PaymentExpectation {
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
    !/^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/.test(v.reference) ||
    !/[A-Za-z]/.test(v.reference) ||
    !/\d/.test(v.reference) ||
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
    recipientName: v.recipientName,
    recipientAccountLast4: v.recipientAccountLast4,
    reference: v.reference,
    validFrom: v.validFrom,
    validUntil: v.validUntil,
  });
}

/** Pure comparison only. No claims, settlement transition, clock, or I/O. */
export function compareReceipt(
  expectation: PaymentExpectation,
  evidence: unknown,
): ReceiptComparison {
  const expected = createPaymentExpectation(expectation);
  const v = record(evidence);
  const checks: Partial<Record<EvidenceField | 'integrity', FieldCheck>> = {};
  const fields: readonly EvidenceField[] = [
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
  const ambiguous = v.ambiguousFields;
  if (
    !Array.isArray(ambiguous) ||
    Array.from(ambiguous).some((f: unknown) => !fields.includes(f as EvidenceField))
  ) {
    checks.integrity = 'INVALID';
  }
  const check = (field: EvidenceField, valid: boolean, matches: boolean): void => {
    const value = v[field];
    checks[field] =
      Array.isArray(ambiguous) && ambiguous.includes(field)
        ? 'AMBIGUOUS'
        : value === null || value === undefined || value === ''
          ? 'MISSING'
          : !valid
            ? 'INVALID'
            : matches
              ? 'PASS'
              : 'FAIL';
  };
  check(
    'provider',
    v.provider === 'telebirr' || v.provider === 'cbe',
    v.provider === expected.provider,
  );
  check(
    'currency',
    typeof v.currency === 'string' && /^[A-Z]{3}$/.test(v.currency),
    v.currency === expected.currency,
  );
  check(
    'transactionId',
    typeof v.transactionId === 'string' && /^[A-Z0-9_-]{6,40}$/.test(v.transactionId),
    true,
  );
  check(
    'status',
    ['SUCCESSFUL', 'PENDING', 'FAILED', 'REVERSED', 'CANCELLED'].includes(v.status as string),
    v.status === 'SUCCESSFUL',
  );
  check('amountMinor', amount(v.amountMinor), v.amountMinor === expected.amountMinor);
  check(
    'recipientName',
    text(v.recipientName),
    text(v.recipientName) && name(v.recipientName) === name(expected.recipientName),
  );
  check(
    'recipientAccountLast4',
    typeof v.recipientAccountLast4 === 'string' && /^\d{4}$/.test(v.recipientAccountLast4),
    v.recipientAccountLast4 === expected.recipientAccountLast4,
  );
  check('reference', text(v.reference), v.reference === expected.reference);
  check(
    'transactionAt',
    timestamp(v.transactionAt),
    timestamp(v.transactionAt) &&
      v.transactionAt >= expected.validFrom &&
      v.transactionAt <= expected.validUntil,
  );
  if (expected.provider === 'cbe')
    check('paymentType', text(v.paymentType), v.paymentType === 'A2A');
  // Contradictory fields remain unverified when any required evidence is incomplete.
  const values = Object.values(checks);
  const verificationStatus = values.some(
    (c) => c === 'MISSING' || c === 'INVALID' || c === 'AMBIGUOUS',
  )
    ? 'UNABLE_TO_VERIFY'
    : values.includes('FAIL')
      ? 'MISMATCHED'
      : 'MATCHED_RECEIPT_ONLY';
  return Object.freeze({
    verificationStatus,
    settlementStatus: 'UNCONFIRMED',
    checks: Object.freeze(checks),
  });
}
