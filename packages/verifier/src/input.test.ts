import { describe, expect, it } from 'vite-plus/test';
import { detectPaymentInput, PAYMENT_INPUT_LIMIT } from './input.ts';
import { officialLocator } from './providers/locator.ts';

const telebirrUrl = 'https://transactioninfo.ethiotelecom.et/receipt/SYNTHR1234';
const cbeUrl = 'https://mbreciept.cbe.com.et/v2-Synthetic_42';

describe('payment input detection', () => {
  it.each([
    [' (sYnThR1234). ', 'telebirr', 'identifier', 'SYNTHR1234'],
    [telebirrUrl, 'telebirr', 'receipt_url', 'SYNTHR1234'],
    [
      `Paid ETB 10. Fee 1. Receipt ${telebirrUrl}.Thank you for using telebirr. Balance ETB 50.`,
      'telebirr',
      'sms',
      'SYNTHR1234',
    ],
    ['v2-Synthetic_42', 'cbe', 'identifier', 'v2-Synthetic_42'],
    [cbeUrl, 'cbe', 'receipt_url', 'v2-Synthetic_42'],
    [
      'CBE Receipt ID: v2-Synthetic_42. Feedback: https://example.invalid/v2-Ignored. Balance ETB 50.',
      'cbe',
      'sms',
      'v2-Synthetic_42',
    ],
  ] as const)('extracts %s without retrieval', (input, provider, inputType, identifier) => {
    const result = detectPaymentInput(input);
    expect(result).toEqual({
      ok: true,
      value: {
        provider,
        inputType,
        identifier,
        identifierKind: provider === 'cbe' ? 'receipt_id' : 'transaction_id',
      },
    });
    if (result.ok)
      expect(officialLocator(result.value).url).toBe(provider === 'cbe' ? cbeUrl : telebirrUrl);
  });
  it('deduplicates the same ID and ignores invoice text and unrelated links', () => {
    expect(
      detectPaymentInput(
        `Your transaction number is synthR1234. Invoice: ORDER_1234. Receipt: ${telebirrUrl}. Feedback https://example.invalid/v2-Other`,
      ),
    ).toMatchObject({ ok: true, value: { identifier: 'SYNTHR1234' } });
    expect(detectPaymentInput(`Receipt ID v2-Synthetic_42 and ${cbeUrl}.`)).toMatchObject({
      ok: true,
      value: { identifier: 'v2-Synthetic_42' },
    });
  });
  it.each([
    ['', 'EMPTY_INPUT'],
    ['x'.repeat(PAYMENT_INPUT_LIMIT + 1), 'INPUT_TOO_LONG'],
    ['Transfer happened. Invoice: ORDER_1234.', 'UNRECOGNIZED_INPUT'],
    ['v2-', 'INVALID_IDENTIFIER'],
    ['Transaction ID: TOO-SHORT', 'INVALID_IDENTIFIER'],
    ['https://example.invalid/v2-Synthetic_42', 'UNSUPPORTED_RECEIPT_URL'],
    [`${cbeUrl}?extra=1`, 'UNSUPPORTED_RECEIPT_URL'],
    ['https://mbreciept.cbe.com.et@other.invalid/v2-Synthetic_42', 'UNSUPPORTED_RECEIPT_URL'],
    [`ID v2-Conflict and ${cbeUrl}`, 'AMBIGUOUS_INPUT'],
    [`${cbeUrl} and ${telebirrUrl}`, 'AMBIGUOUS_INPUT'],
    [`Transaction ID: OTHER1234. Receipt: ${telebirrUrl}`, 'AMBIGUOUS_INPUT'],
  ])('rejects invalid or conflicting input %#', (input, code) => {
    expect(detectPaymentInput(input)).toMatchObject({ ok: false, error: { code } });
  });
});
