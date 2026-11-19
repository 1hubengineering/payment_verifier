import { describe, expect, it } from 'vite-plus/test';
import { comparePaymentAmount } from './amount-policy.ts';
import type { AmountPolicy } from './amount-policy.ts';

const mixed: AmountPolicy = {
  mode: 'tolerance',
  underpayment: { type: 'fixed', maxMinor: 60 },
  overpayment: { type: 'percentage', percent: '0.50' },
};

describe('payment amount rules', () => {
  it.each([
    [9994, 'FAIL', 'AMOUNT_UNDERPAID', -61, false],
    [9995, 'PASS', null, -60, true],
    [10055, 'PASS', null, 0, false],
    [10105, 'PASS', null, 50, true],
    [10106, 'FAIL', 'AMOUNT_OVERPAID', 51, false],
  ] as const)(
    'compares the actual receipt amount %s against inclusive mixed-unit limits',
    (actual, status, code, differenceMinor, toleranceApplied) => {
      expect(comparePaymentAmount(10055, actual, mixed)).toMatchObject({
        field: 'amountMinor',
        status,
        code,
        expected: 10055,
        actual,
        rule: actual === 10055 ? 'exact' : 'within_tolerance',
        details: {
          minimumAcceptedMinor: 9995,
          maximumAcceptedMinor: 10105,
          differenceMinor,
          exactMatch: actual === 10055,
          toleranceApplied,
        },
      });
    },
  );

  it('defaults to exact and treats omitted directions as zero tolerance', () => {
    expect(comparePaymentAmount(10055, 10054)).toMatchObject({ code: 'AMOUNT_UNDERPAID' });
    expect(comparePaymentAmount(10055, 10056, { mode: 'exact' })).toMatchObject({
      code: 'AMOUNT_OVERPAID',
    });
    expect(
      comparePaymentAmount(10055, 10054, {
        mode: 'tolerance',
        overpayment: { type: 'fixed', maxMinor: 0 },
      }),
    ).toMatchObject({ code: 'AMOUNT_UNDERPAID' });
  });

  it('keeps missing and invalid actual amounts out of tolerance calculations', () => {
    expect(comparePaymentAmount(10055, null, mixed)).toMatchObject({
      status: 'MISSING',
      actual: null,
      details: { differenceMinor: null, exactMatch: null, toleranceApplied: false },
    });
    for (const actual of [0, -1, '10055', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
      expect(comparePaymentAmount(10055, actual, mixed)).toMatchObject({
        status: 'INVALID',
        actual: null,
      });
  });

  it('accepts an explicit cap and keeps calculations exact near the safe integer limit', () => {
    expect(
      comparePaymentAmount(100, 120, {
        mode: 'tolerance',
        maxPercent: '20',
        overpayment: { type: 'percentage', percent: '20.0' },
      }),
    ).toMatchObject({
      status: 'PASS',
      actual: 120,
      details: {
        maximumAcceptedMinor: 120,
        policy: { maxPercent: '20.00', overpayment: { percent: '20.00' } },
      },
    });
    const maximum = Number.MAX_SAFE_INTEGER;
    expect(
      comparePaymentAmount(maximum, maximum - 1, {
        mode: 'tolerance',
        underpayment: { type: 'percentage', percent: '9.99' },
      }),
    ).toMatchObject({
      status: 'PASS',
      details: {
        minimumAcceptedMinor: Number(BigInt(maximum) - (BigInt(maximum) * 999n) / 10_000n),
      },
    });
  });

  it.each([
    [10055, null],
    [10055, { mode: 'bad' }],
    [10055, { mode: 'exact', extra: true }],
    [10055, { mode: 'tolerance', underpayment: { type: 'fixed', maxMinor: -1 } }],
    [10055, { mode: 'tolerance', underpayment: { type: 'fixed', maxMinor: NaN } }],
    [10055, { mode: 'tolerance', underpayment: { type: 'fixed', maxMinor: 1.2 } }],
    [10055, { mode: 'tolerance', underpayment: { type: 'fixed', maxMinor: Infinity } }],
    [
      10055,
      { mode: 'tolerance', underpayment: { type: 'fixed', maxMinor: Number.MAX_SAFE_INTEGER + 1 } },
    ],
    [10055, { mode: 'tolerance', overpayment: { type: 'fixed', maxMinor: 1006 } }],
    [10055, { mode: 'tolerance', overpayment: { type: 'percentage', percent: '0.500' } }],
    [
      10055,
      { mode: 'tolerance', overpayment: { type: 'percentage', percent: '0.50', maxMinor: 10 } },
    ],
    [10055, { mode: 'tolerance', overpayment: { type: 'percentage', percent: '11.00' } }],
    [10055, { mode: 'tolerance', maxPercent: '101' }],
    [1, { mode: 'tolerance', maxPercent: '100', underpayment: { type: 'fixed', maxMinor: 1 } }],
    [Number.MAX_SAFE_INTEGER, { mode: 'tolerance', overpayment: { type: 'fixed', maxMinor: 1 } }],
  ])('rejects invalid or unsafe policy %#', (expected, policy) => {
    expect(() => comparePaymentAmount(expected, expected, policy as AmountPolicy)).toThrow(
      expect.objectContaining({ code: 'INVALID_AMOUNT_POLICY' }),
    );
  });
});
