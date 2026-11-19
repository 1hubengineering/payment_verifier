import { describe, expect, it } from 'vite-plus/test';
import { compareReceipt, createPaymentExpectation } from './comparison.ts';
import type { EvidenceField, ReceiptEvidence } from './comparison.ts';
import { parseEtbAmount } from './money.ts';

const input = {
  tenantId: 'tenant-synthetic',
  paymentId: 'payment-synthetic',
  provider: 'telebirr',
  currency: 'ETB',
  amountMinor: parseEtbAmount('0.29'),
  recipientName: 'Synthetic Merchant',
  recipientAccountLast4: '1234',
  reference: 'ORDER_1234',
  validFrom: 1_700_000_000_000,
  validUntil: 1_700_000_060_000,
};
const expected = createPaymentExpectation(input);
const receipt: ReceiptEvidence = {
  provider: 'telebirr',
  currency: 'ETB',
  transactionId: 'SYNTH1234',
  status: 'SUCCESSFUL',
  amountMinor: parseEtbAmount('0.29'),
  recipientName: 'Synthetic Merchant',
  recipientAccountLast4: '1234',
  reference: 'ORDER_1234',
  transactionAt: input.validFrom,
  paymentType: null,
  ambiguousFields: [],
};
const publicField = {
  status: 'paymentStatus',
  recipientAccountLast4: 'recipientAccount',
  reference: 'invoiceReference',
  transactionAt: 'transactionTime',
} as const;
function checkField(field: EvidenceField): string {
  return publicField[field as keyof typeof publicField] ?? field;
}
const required: EvidenceField[] = [
  'provider',
  'currency',
  'transactionId',
  'status',
  'amountMinor',
  'recipientName',
  'recipientAccountLast4',
  'reference',
  'transactionAt',
];

describe('trusted expectation', () => {
  it('copies and freezes only known fields', () => {
    const source = { ...input, arbitrary: 'submission data' };
    const snapshot = createPaymentExpectation(source);
    source.amountMinor = parseEtbAmount('99');
    expect(snapshot.amountMinor).toBe(29);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(snapshot).not.toHaveProperty('arbitrary');
    expect(() => Object.assign(snapshot, { reference: 'OTHER123' })).toThrow();
  });
  it.each([
    null,
    {},
    { ...input, tenantId: '' },
    { ...input, tenantId: ' tenant' },
    { ...input, paymentId: '' },
    { ...input, provider: 'unknown' },
    { ...input, currency: 'USD' },
    { ...input, amountMinor: 0 },
    { ...input, amountMinor: 0.29 },
    { ...input, amountMinor: NaN },
    { ...input, amountMinor: Number.MAX_SAFE_INTEGER + 1 },
    { ...input, recipientName: ' ' },
    { ...input, recipientAccountLast4: '１２３４' },
    { ...input, reference: '12345678' },
    { ...input, reference: 'ORDER123\n' },
    { ...input, validFrom: '2026-11-18' },
    { ...input, validFrom: -1 },
    { ...input, validUntil: Infinity },
    { ...input, validUntil: input.validFrom - 1 },
  ])('rejects invalid trusted input %#', (value) => {
    expect(() => createPaymentExpectation(value)).toThrow('Invalid trusted payment expectation');
  });
});

describe('receipt comparison', () => {
  it('compares exact minor units without returning SDK verification', () => {
    expect(compareReceipt(expected, receipt)).toMatchObject({
      status: 'MATCH',
      code: null,
    });
    expect(compareReceipt(expected, receipt)).not.toHaveProperty('verified');
    expect(compareReceipt(expected, receipt).checks).toContainEqual(
      expect.objectContaining({
        field: 'paymentType',
        status: 'SKIPPED',
        code: 'CHECK_DISABLED',
        required: false,
      }),
    );
  });
  it.each(required)('fails closed for missing %s, even alongside a mismatch', (field) => {
    const result = compareReceipt(expected, { ...receipt, reference: 'OTHER123', [field]: null });
    expect(result.status).toBe(field === 'reference' ? 'INCOMPLETE' : 'MISMATCH');
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        field: checkField(field),
        status: 'MISSING',
        code: 'REQUIRED_FIELD_MISSING',
      }),
    );
  });
  it.each(required)('fails closed for ambiguous %s', (field) => {
    const result = compareReceipt(expected, { ...receipt, ambiguousFields: [field] });
    expect(result.status).toBe('INCOMPLETE');
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        field: checkField(field),
        status: 'AMBIGUOUS',
        code: 'AMBIGUOUS_RECEIPT_FIELD',
      }),
    );
  });
  it.each([
    [{ provider: 'cbe' }, 'RECEIPT_PROVIDER_MISMATCH'],
    [{ transactionId: 'OTHER1234' }, 'TRANSACTION_ID_MISMATCH'],
    [{ currency: 'USD' }, 'CURRENCY_MISMATCH'],
    [{ status: 'PENDING' }, 'PAYMENT_PENDING'],
    [{ status: 'FAILED' }, 'PAYMENT_FAILED'],
    [{ status: 'REVERSED' }, 'PAYMENT_REVERSED'],
    [{ status: 'CANCELLED' }, 'PAYMENT_CANCELLED'],
    [{ amountMinor: 30 }, 'AMOUNT_OVERPAID'],
    [{ recipientName: 'Other Merchant' }, 'RECIPIENT_NAME_MISMATCH'],
    [{ recipientAccountLast4: '9999' }, 'RECIPIENT_ACCOUNT_MISMATCH'],
    [{ reference: 'order_1234' }, 'INVOICE_REFERENCE_MISMATCH'],
    [{ transactionAt: input.validFrom - 1 }, 'PAYMENT_TIME_OUT_OF_RANGE'],
  ])('reports the exact reason for conflicting evidence %#', (patch, code) => {
    const result = compareReceipt(expected, { ...receipt, ...patch }, receipt.transactionId!);
    expect(result).toMatchObject({ status: 'MISMATCH', code });
    expect(result.checks).toContainEqual(expect.objectContaining({ status: 'FAIL', code }));
  });
  it.each([
    null,
    {},
    { ...receipt, amountMinor: 29.00001 },
    { ...receipt, amountMinor: '29' },
    { ...receipt, amountMinor: NaN },
    { ...receipt, amountMinor: Infinity },
    { ...receipt, transactionId: 'SYNTH1234\n' },
    { ...receipt, transactionId: 'synth1234' },
    { ...receipt, status: 'UNKNOWN' },
    { ...receipt, transactionAt: '2023-11-14T22:13:20Z' },
    { ...receipt, transactionAt: input.validFrom + 0.5 },
    { ...receipt, ambiguousFields: undefined },
    { ...receipt, ambiguousFields: ['unknown'] },
    { ...receipt, ambiguousFields: Array(1) },
  ])('does not coerce malformed evidence %#', (value) => {
    expect(compareReceipt(expected, value).status).toBe('INCOMPLETE');
  });
  it.each([input.validFrom, input.validUntil])('includes time boundary %s', (transactionAt) => {
    expect(compareReceipt(expected, { ...receipt, transactionAt }).status).toBe('MATCH');
  });
  it('normalizes only name whitespace and case', () => {
    expect(
      compareReceipt(expected, { ...receipt, recipientName: '  SYNTHETIC   merchant ' }).status,
    ).toBe('MATCH');
    expect(compareReceipt(expected, { ...receipt, reference: ' ORDER_1234 ' }).status).toBe(
      'MISMATCH',
    );
  });
  it('requires direct account transfer for CBE', () => {
    const cbe = createPaymentExpectation({ ...input, provider: 'cbe' });
    const evidence = { ...receipt, provider: 'cbe' };
    expect(compareReceipt(cbe, evidence).status).toBe('INCOMPLETE');
    expect(compareReceipt(cbe, { ...evidence, paymentType: 'OTHER' }).status).toBe('MISMATCH');
    expect(compareReceipt(cbe, { ...evidence, paymentType: 'A2A' }).status).toBe('MATCH');
    expect(
      compareReceipt(cbe, { ...evidence, paymentType: 'A2A', ambiguousFields: ['paymentType'] })
        .status,
    ).toBe('INCOMPLETE');
  });
  it('freezes a canonical policy and uses a trusted default only when the host omitted the policy', () => {
    const policy = { mode: 'tolerance', underpayment: { type: 'fixed', maxMinor: 1 } } as const;
    const configured = createPaymentExpectation(input, { defaultAmountPolicy: policy });
    expect(configured.amountPolicy).toEqual({ ...policy, maxPercent: '10.00' });
    expect(Object.isFrozen(configured.amountPolicy)).toBe(true);
    expect(
      createPaymentExpectation(
        { ...input, amountPolicy: { mode: 'exact' } },
        { defaultAmountPolicy: policy },
      ).amountPolicy,
    ).toEqual({ mode: 'exact' });
  });
  it.each([
    [{ reference: 'OTHER1234' }, 'INVOICE_REFERENCE_MISMATCH'],
    [{ recipientAccountLast4: '9876' }, 'RECIPIENT_ACCOUNT_MISMATCH'],
  ])('keeps other required checks when the amount matches within tolerance %#', (patch, code) => {
    const flexible = createPaymentExpectation({
      ...input,
      amountMinor: 30,
      amountPolicy: {
        mode: 'tolerance',
        underpayment: { type: 'fixed', maxMinor: 1 },
      },
    });
    const result = compareReceipt(flexible, { ...receipt, ...patch });
    expect(result).toMatchObject({ status: 'MISMATCH', code });
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        field: 'amountMinor',
        status: 'PASS',
        details: expect.objectContaining({ toleranceApplied: true }),
      }),
    );
  });
  it('revalidates expectations supplied by untyped consumers', () => {
    expect(() =>
      compareReceipt({ ...expected, amountMinor: 0 as typeof expected.amountMinor }, receipt),
    ).toThrow();
  });
  it('returns deterministic frozen results without mutating input', () => {
    const before = structuredClone(receipt);
    const first = compareReceipt(expected, receipt);
    expect(compareReceipt(expected, receipt)).toEqual(first);
    expect(receipt).toEqual(before);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.checks)).toBe(true);
  });
});
