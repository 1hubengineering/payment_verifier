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
  it('matches exact minor units with explicit receipt-only settlement state', () => {
    expect(compareReceipt(expected, receipt)).toMatchObject({
      verificationStatus: 'MATCHED_RECEIPT_ONLY',
      settlementStatus: 'UNCONFIRMED',
    });
    expect(compareReceipt(expected, receipt)).not.toHaveProperty('paid');
  });
  it.each(required)('fails closed for missing %s, even alongside a mismatch', (field) => {
    const result = compareReceipt(expected, { ...receipt, reference: 'OTHER123', [field]: null });
    expect(result.verificationStatus).toBe('UNABLE_TO_VERIFY');
    expect(result.checks[field]).toBe('MISSING');
  });
  it.each(required)('fails closed for ambiguous %s', (field) => {
    const result = compareReceipt(expected, { ...receipt, ambiguousFields: [field] });
    expect(result.verificationStatus).toBe('UNABLE_TO_VERIFY');
    expect(result.checks[field]).toBe('AMBIGUOUS');
  });
  it.each([
    { provider: 'cbe' },
    { currency: 'USD' },
    { status: 'PENDING' },
    { status: 'FAILED' },
    { status: 'REVERSED' },
    { status: 'CANCELLED' },
    { amountMinor: 30 },
    { recipientName: 'Other Merchant' },
    { recipientAccountLast4: '9999' },
    { reference: 'order_1234' },
    { reference: 'ORDER_1234 extra' },
    { transactionAt: input.validFrom - 1 },
    { transactionAt: input.validUntil + 1 },
  ])('rejects complete conflicting evidence %#', (patch) => {
    expect(compareReceipt(expected, { ...receipt, ...patch }).verificationStatus).toBe(
      'MISMATCHED',
    );
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
    expect(compareReceipt(expected, value).verificationStatus).toBe('UNABLE_TO_VERIFY');
  });
  it.each([input.validFrom, input.validUntil])('includes time boundary %s', (transactionAt) => {
    expect(compareReceipt(expected, { ...receipt, transactionAt }).verificationStatus).toBe(
      'MATCHED_RECEIPT_ONLY',
    );
  });
  it('normalizes only name whitespace and case', () => {
    expect(
      compareReceipt(expected, { ...receipt, recipientName: '  SYNTHETIC   merchant ' })
        .verificationStatus,
    ).toBe('MATCHED_RECEIPT_ONLY');
    expect(
      compareReceipt(expected, { ...receipt, reference: ' ORDER_1234 ' }).verificationStatus,
    ).toBe('MISMATCHED');
  });
  it('requires direct account transfer for CBE', () => {
    const cbe = createPaymentExpectation({ ...input, provider: 'cbe' });
    const evidence = { ...receipt, provider: 'cbe' };
    expect(compareReceipt(cbe, evidence).verificationStatus).toBe('UNABLE_TO_VERIFY');
    expect(compareReceipt(cbe, { ...evidence, paymentType: 'OTHER' }).verificationStatus).toBe(
      'MISMATCHED',
    );
    expect(compareReceipt(cbe, { ...evidence, paymentType: 'A2A' }).verificationStatus).toBe(
      'MATCHED_RECEIPT_ONLY',
    );
    expect(
      compareReceipt(cbe, { ...evidence, paymentType: 'A2A', ambiguousFields: ['paymentType'] })
        .verificationStatus,
    ).toBe('UNABLE_TO_VERIFY');
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
