import { VerificationOperationError } from './outcomes.ts';
import type { AmountCheck } from './outcomes.ts';

export type AmountAllowance =
  | { readonly type: 'fixed'; readonly maxMinor: number }
  | { readonly type: 'percentage'; readonly percent: string };

export type AmountPolicy =
  | { readonly mode: 'exact' }
  | {
      readonly mode: 'tolerance';
      readonly underpayment?: AmountAllowance;
      readonly overpayment?: AmountAllowance;
      /** Maximum percentage of the expected principal allowed in either direction. Defaults to 10%. */
      readonly maxPercent?: string;
    };

export interface AmountCheckDetails {
  readonly policy: AmountPolicy;
  readonly differenceMinor: number | null;
  readonly minimumAcceptedMinor: number;
  readonly maximumAcceptedMinor: number;
  readonly exactMatch: boolean | null;
  readonly toleranceApplied: boolean;
  readonly direction: 'UNDERPAID' | 'OVERPAID' | null;
}

interface AmountRange {
  readonly policy: AmountPolicy;
  readonly minimum: number;
  readonly maximum: number;
}

const defaultLimitBps = 1000;
const basisPointDivisor = 10_000n;
const exact: AmountPolicy = Object.freeze({ mode: 'exact' });

export function isPositiveMinor(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function invalidPolicy(): never {
  throw new VerificationOperationError('INVALID_AMOUNT_POLICY', 'expectation');
}

function policyRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalidPolicy();
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return invalidPolicy();
  return value as Record<string, unknown>;
}

function onlyKeys(record: Record<string, unknown>, allowed: readonly string[]): void {
  if (Reflect.ownKeys(record).some((key) => typeof key !== 'string' || !allowed.includes(key)))
    invalidPolicy();
}

function parsePercent(value: unknown): number {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,2})(?:\.\d{1,2})?$/.test(value))
    return invalidPolicy();
  const [whole, fraction = ''] = value.split('.');
  const bps = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (bps > 10_000) return invalidPolicy();
  return bps;
}

function canonicalPercent(bps: number): string {
  return `${Math.floor(bps / 100)}.${String(bps % 100).padStart(2, '0')}`;
}

function allowance(
  value: unknown,
  expected: bigint,
  limitBps: number,
): { policy?: AmountAllowance; minor: bigint } {
  if (value === undefined) return { minor: 0n };
  const option = policyRecord(value);
  if (option.type === 'fixed') {
    onlyKeys(option, ['type', 'maxMinor']);
    const max = option.maxMinor;
    if (typeof max !== 'number' || !Number.isSafeInteger(max) || max < 0) return invalidPolicy();
    const minor = BigInt(max);
    if (minor > (expected * BigInt(limitBps)) / basisPointDivisor) return invalidPolicy();
    return { policy: Object.freeze({ type: 'fixed', maxMinor: max === 0 ? 0 : max }), minor };
  }
  if (option.type === 'percentage') {
    onlyKeys(option, ['type', 'percent']);
    const bps = parsePercent(option.percent);
    if (bps > limitBps) return invalidPolicy();
    return {
      policy: Object.freeze({ type: 'percentage', percent: canonicalPercent(bps) }),
      minor: (expected * BigInt(bps)) / basisPointDivisor,
    };
  }
  return invalidPolicy();
}

export function amountRange(expected: number, policy: unknown): AmountRange {
  if (!isPositiveMinor(expected))
    throw new VerificationOperationError('INVALID_EXPECTATION', 'expectation');
  if (policy === undefined) return { policy: exact, minimum: expected, maximum: expected };
  const value = policyRecord(policy);
  if (value.mode === 'exact') {
    onlyKeys(value, ['mode']);
    return { policy: exact, minimum: expected, maximum: expected };
  }
  if (value.mode !== 'tolerance') return invalidPolicy();
  onlyKeys(value, ['mode', 'underpayment', 'overpayment', 'maxPercent']);
  const limit = value.maxPercent === undefined ? defaultLimitBps : parsePercent(value.maxPercent);
  const base = BigInt(expected);
  const under = allowance(value.underpayment, base, limit);
  const over = allowance(value.overpayment, base, limit);
  const minimum = base - under.minor;
  const maximum = base + over.minor;
  if (minimum < 1n || maximum > BigInt(Number.MAX_SAFE_INTEGER)) return invalidPolicy();
  return {
    policy: Object.freeze({
      mode: 'tolerance',
      maxPercent: canonicalPercent(limit),
      ...(under.policy ? { underpayment: under.policy } : {}),
      ...(over.policy ? { overpayment: over.policy } : {}),
    }),
    minimum: Number(minimum),
    maximum: Number(maximum),
  };
}

/** Compare the observed transfer principal against the trusted expected range. */
export function comparePaymentAmount(
  expectedMinor: number,
  actualMinor: unknown,
  policy?: AmountPolicy,
): AmountCheck {
  const { policy: effective, minimum, maximum } = amountRange(expectedMinor, policy);
  const actual = isPositiveMinor(actualMinor) ? actualMinor : null;
  const difference = actual === null ? null : actual - expectedMinor;
  const withinRange = actual !== null && actual >= minimum && actual <= maximum;
  const direction: AmountCheckDetails['direction'] =
    difference === null || difference === 0 ? null : difference < 0 ? 'UNDERPAID' : 'OVERPAID';
  const base = {
    field: 'amountMinor' as const,
    required: true as const,
    expected: expectedMinor,
    actual,
    rule:
      difference === 0 || effective.mode === 'exact'
        ? ('exact' as const)
        : ('within_tolerance' as const),
    details: {
      policy: effective,
      differenceMinor: difference,
      minimumAcceptedMinor: minimum,
      maximumAcceptedMinor: maximum,
      direction,
      exactMatch: difference === null ? null : difference === 0,
      toleranceApplied: withinRange && difference !== 0,
    },
  };
  if (actual === null)
    return actualMinor === null || actualMinor === undefined
      ? { ...base, status: 'MISSING', code: 'REQUIRED_FIELD_MISSING' }
      : { ...base, status: 'INVALID', code: 'INVALID_RECEIPT_FIELD' };
  if (withinRange) return { ...base, status: 'PASS', code: null };
  return {
    ...base,
    status: 'FAIL',
    code: direction === 'UNDERPAID' ? 'AMOUNT_UNDERPAID' : 'AMOUNT_OVERPAID',
  };
}
