import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vite-plus/test';
import { compareReceipt, createPaymentExpectation } from '../comparison.ts';
import { parseEtbAmount } from '../money.ts';
import { parseProviderTime, parseReceiptHtml } from './extraction.ts';
import { normalizeReceiptLocator } from './locator.ts';

const fixture = (file: string): string =>
  readFileSync(
    new URL(`../../../../tests/reference-cli/fixtures/${file}`, import.meta.url),
    'utf8',
  );
const expectation = (provider: 'cbe' | 'telebirr') =>
  createPaymentExpectation({
    tenantId: 'synthetic',
    paymentId: 'synthetic',
    provider,
    currency: 'ETB',
    amountMinor: parseEtbAmount(provider === 'cbe' ? '230.00' : '10.00'),
    recipientName: 'Example Merchant',
    recipientAccountLast4: provider === 'cbe' ? '4867' : '1123',
    reference: provider === 'cbe' ? 'AH-TEST-5932' : 'AH-TEST-4821',
    validFrom: Date.parse('2026-11-13T11:19:00Z'),
    validUntil: Date.parse('2026-11-13T11:21:00Z'),
  });
const v5 = fixture('telebirr.v5-table.mock.html');

describe('ported synthetic extraction', () => {
  it.each(['telebirr.v5-table.mock.html', 'telebirr.bilingual.mock.html'])(
    'extracts %s and matches the time-bound snapshot',
    (file) => {
      const parsed = parseReceiptHtml('telebirr', fixture(file), 'TEST1234AB');
      expect(parsed.provenance.kind).toBe('SAVED_HTML');
      expect(parsed.evidence.amountMinor).toBe(1000);
      expect(parsed.evidence.transactionId).toBe('TEST1234AB');
      expect(compareReceipt(expectation('telebirr'), parsed.evidence).verificationStatus).toBe(
        'MATCHED_RECEIPT_ONLY',
      );
    },
  );
  it('extracts CBE recipient account rather than payer or total debited', () => {
    const parsed = parseReceiptHtml('cbe', fixture('cbe.mock.html'));
    expect(parsed.evidence).toMatchObject({
      recipientAccountLast4: '4867',
      amountMinor: 23000,
      paymentType: 'A2A',
    });
    expect(compareReceipt(expectation('cbe'), parsed.evidence).verificationStatus).toBe(
      'MATCHED_RECEIPT_ONLY',
    );
  });
  it('does not invent a missing timestamp from the simpler Telebirr layout', () => {
    const parsed = parseReceiptHtml('telebirr', fixture('telebirr.mock.html'), 'TEST1234AB');
    expect(parsed.evidence.amountMinor).toBe(1000);
    expect(compareReceipt(expectation('telebirr'), parsed.evidence).verificationStatus).toBe(
      'UNABLE_TO_VERIFY',
    );
  });
  it.each([
    '',
    '<html>TEST1234AB Completed 10.00 Birr Example Merchant 1123 AH-TEST-4821</html>',
    v5.replace('TEST1234AB', 'OTHER1234'),
    v5.replace('10.00 Birr', '10.001 Birr'),
    v5.replace('10.00 Birr', '10,00 Birr'),
    v5.replace('10.00 Birr', '10.00 USD'),
    v5.replace('13-11-2026', '31-02-2026'),
    v5.replace('Completed', 'Not Completed'),
    v5.replace('Example Merchant', ''),
    v5.replace('AH-TEST-4821', ''),
    `<script>${v5}</script>`,
    `<!-- ${v5} -->`,
  ])('fails closed on incomplete, unsupported or contradictory HTML %#', (html) => {
    expect(
      compareReceipt(
        expectation('telebirr'),
        parseReceiptHtml('telebirr', html, 'TEST1234AB').evidence,
      ).verificationStatus,
    ).not.toBe('MATCHED_RECEIPT_ONLY');
  });
  it.each([
    ['Customer Note', 'OTHER1234', 'reference'],
    ['transaction status', 'Failed', 'status'],
    ['Credited Party Name', 'Other Merchant', 'recipientName'],
    ['Credited party account no', '2519****9999', 'recipientAccountLast4'],
  ])('retains conflicting duplicate %s', (label, value, field) => {
    const html = v5.replace('</table>', `<tr><td>${label}</td><td>${value}</td></tr></table>`);
    const parsed = parseReceiptHtml('telebirr', html, 'TEST1234AB');
    expect(parsed.evidence.ambiguousFields).toContain(field);
    expect(compareReceipt(expectation('telebirr'), parsed.evidence).verificationStatus).toBe(
      'UNABLE_TO_VERIFY',
    );
  });
  it('does not select one invoice from multiple invoice rows', () => {
    const html = v5.replace(
      '<tr><td>Customer Note',
      '<tr><td>OTHER1234</td><td>13-11-2026 14:20:00</td><td>99.00 Birr</td></tr><tr><td>Customer Note',
    );
    const parsed = parseReceiptHtml('telebirr', html, 'TEST1234AB');
    expect(parsed.evidence.ambiguousFields).toContain('transactionId');
    expect(parsed.evidence.ambiguousFields).toContain('amountMinor');
  });
  it('parses exact cents without rounding and excludes fees', () => {
    expect(
      parseReceiptHtml('telebirr', v5.replace('10.00 Birr', '0.29 Birr'), 'TEST1234AB').evidence
        .amountMinor,
    ).toBe(29);
  });
  it('rejects oversized HTML and malformed expected identifiers', () => {
    expect(() => parseReceiptHtml('telebirr', 'x'.repeat(2_000_001))).toThrow();
    expect(() => parseReceiptHtml('telebirr', v5, '.*')).toThrow();
  });
});

describe('strict calendar and zone conversion', () => {
  it.each([
    '13-11-2026 14:20:00',
    '2026-11-13 14:20:00',
    'Nov 13, 2026, 2:20 PM',
    '2026-11-13T14:20:00+03:00',
    '2026-11-13T11:20:00Z',
  ])('normalizes %s', (value) =>
    expect(parseProviderTime(value)).toBe(Date.parse('2026-11-13T11:20:00Z')),
  );
  it.each([
    '31-02-2026 14:20:00',
    '2026-02-29 12:00:00',
    'Nov 13, 2026, 0:20 PM',
    'Nov 13, 2026, 13:20 PM',
    '2026-11-13T14:20:00+14:01',
    '2026-11-13T14:20:60Z',
    '2026-11-13T24:00:00Z',
    '11/13/26',
    'not a date',
  ])('rejects %s', (value) => expect(parseProviderTime(value)).toBeNull());
});

describe('official locators', () => {
  it('accepts an ID, official link or SMS with matching IDs', () => {
    const locator = normalizeReceiptLocator('telebirr', 'test1234ab');
    expect(
      normalizeReceiptLocator('telebirr', `Transaction ID: TEST1234AB ${locator.url}`),
    ).toEqual(locator);
    expect(
      normalizeReceiptLocator('cbe', 'https://mbreciept.cbe.com.et/v2-SYNTHETIC').url,
    ).toContain('/v2-SYNTHETIC');
  });
  it.each([
    'https://evil.test/receipt/TEST1234AB',
    'http://transactioninfo.ethiotelecom.et/receipt/TEST1234AB',
    'https://transactioninfo.ethiotelecom.et:443/receipt/TEST1234AB',
    'https://transactioninfo.ethiotelecom.et/receipt/TEST1234AB?x=1',
    'https://transactioninfo.ethiotelecom.et/receipt/TEST1234AB#x',
    'https://transactioninfo.ethiotelecom.et@127.0.0.1/receipt/TEST1234AB',
    'Transaction ID: TEST1234AB Invoice: OTHER1234',
    'https://transactioninfo.ethiotelecom.et/receipt/TEST1234AB https://evil.test/',
    '',
  ])('rejects untrusted or conflicting locator %s', (value) =>
    expect(() => normalizeReceiptLocator('telebirr', value)).toThrow(),
  );
});
