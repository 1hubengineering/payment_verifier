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
      const parsed = parseReceiptHtml('telebirr', fixture(file));
      expect(parsed.provenance.kind).toBe('SAVED_HTML');
      expect(parsed.evidence.amountMinor).toBe(1000);
      expect(parsed.evidence.transactionId).toBe('TEST1234AB');
      expect(compareReceipt(expectation('telebirr'), parsed.evidence).status).toBe('MATCH');
    },
  );
  it('extracts CBE recipient account rather than payer or total debited', () => {
    const parsed = parseReceiptHtml('cbe', fixture('cbe.mock.html'));
    expect(parsed.evidence).toMatchObject({
      recipientAccountLast4: '4867',
      amountMinor: 23000,
      paymentType: 'A2A',
    });
    expect(compareReceipt(expectation('cbe'), parsed.evidence).status).toBe('MATCH');
  });
  it('does not invent a missing timestamp from the simpler Telebirr layout', () => {
    const parsed = parseReceiptHtml('telebirr', fixture('telebirr.mock.html'));
    expect(parsed.evidence.amountMinor).toBe(1000);
    expect(compareReceipt(expectation('telebirr'), parsed.evidence).status).toBe('INCOMPLETE');
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
        parseReceiptHtml('telebirr', html).evidence,
        'TEST1234AB',
      ).status,
    ).not.toBe('MATCH');
  });
  it.each([
    ['Customer Note', 'OTHER1234', 'reference'],
    ['transaction status', 'Failed', 'status'],
    ['Credited Party Name', 'Other Merchant', 'recipientName'],
    ['Credited party account no', '2519****9999', 'recipientAccountLast4'],
  ])('retains conflicting duplicate %s', (label, value, field) => {
    const html = v5.replace('</table>', `<tr><td>${label}</td><td>${value}</td></tr></table>`);
    const parsed = parseReceiptHtml('telebirr', html);
    expect(parsed.evidence.ambiguousFields).toContain(field);
    expect(compareReceipt(expectation('telebirr'), parsed.evidence).status).toBe('INCOMPLETE');
  });
  it('does not select one invoice from multiple invoice rows', () => {
    const html = v5.replace(
      '<tr><td>Customer Note',
      '<tr><td>OTHER1234</td><td>13-11-2026 14:20:00</td><td>99.00 Birr</td></tr><tr><td>Customer Note',
    );
    const parsed = parseReceiptHtml('telebirr', html);
    expect(parsed.evidence.ambiguousFields).toContain('transactionId');
    expect(parsed.evidence.ambiguousFields).toContain('amountMinor');
  });
  it('extracts Telebirr receipt tables inside presentation tables', () => {
    const receiptTable = v5.slice(v5.indexOf('<table>'), v5.lastIndexOf('</table>') + 8);
    const html = `<table><tr><td>Receipt information<td style="text-align: center" "><table><tr><td>${receiptTable}</table><tr><div><table><tr><td>Footer</td></tr></table></div></tr></table>`;
    const parsed = parseReceiptHtml('telebirr', html);
    expect(compareReceipt(expectation('telebirr'), parsed.evidence).status).toBe('MATCH');
  });
  it('preserves invoice and recipient fields across omitted Telebirr cell and row ends', () => {
    const html = v5.replaceAll('</td>', '').replaceAll('</tr>', '');
    const parsed = parseReceiptHtml('telebirr', html);
    expect(compareReceipt(expectation('telebirr'), parsed.evidence).status).toBe('MATCH');
  });
  it('skips Telebirr fee and empty summary rows while retaining later conflicting invoices', () => {
    const summary = `<tr><td></td><td>ማህተም/Stamp Duty</td><td>0.0 Birr</td></tr>
      <tr><td>Service fee</td><td>0.87 Birr</td></tr>
      <tr><td></td><td>Total Paid Amount</td><td>11.00 Birr</td></tr>
      <tr><td></td><td></td><td></td></tr>`;
    const secondInvoice =
      '<tr><td>OTHER1234</td><td>13-11-2026 14:20:00</td><td>99.00 Birr</td></tr>';
    const insert = (rows: string) =>
      v5.replace('<tr><td>Customer Note', rows + '<tr><td>Customer Note');
    const parsed = parseReceiptHtml('telebirr', insert(summary));
    expect(parsed.evidence.amountMinor).toBe(1000);
    expect(compareReceipt(expectation('telebirr'), parsed.evidence).status).toBe('MATCH');
    const conflict = parseReceiptHtml('telebirr', insert(summary + secondInvoice));
    expect(conflict.evidence.ambiguousFields).toEqual(['transactionId', 'amountMinor']);
  });
  it('keeps an invoice header and values in separate tables unassociated', () => {
    const html = `<table><tr><td>Invoice No.</td><td>Payment date</td><td>Settled Amount</td></tr></table>
      <table><tr><td>TEST1234AB</td><td>13-11-2026 14:20:00</td><td>10.00 Birr</td></tr></table>`;
    expect(parseReceiptHtml('telebirr', html).evidence).toMatchObject({
      transactionId: null,
      transactionAt: null,
      amountMinor: null,
    });
  });
  it('rejects nested markup that could hide a conflicting field', () => {
    const html = `<table><tr><td>Credited Party Name</td><td>Other Merchant<table></table></td></tr></table>${v5}`;
    expect(() => parseReceiptHtml('telebirr', html)).toThrow('Unsupported receipt HTML');
  });
  it('parses exact cents without rounding and excludes fees', () => {
    expect(
      parseReceiptHtml('telebirr', v5.replace('10.00 Birr', '0.29 Birr')).evidence.amountMinor,
    ).toBe(29);
  });
  it.each(['script', 'style', 'noscript', 'tr', 'td', 'span'])(
    'bounds maximum-size repeated unclosed %s tags',
    (tag) => {
      const opening = `<${tag}>`;
      const malformed = opening.repeat(Math.floor(2_000_000 / opening.length));
      expect(() => parseReceiptHtml('telebirr', malformed)).toThrow('Unsupported receipt HTML');
    },
  );
  it.each([
    '<div></div>'.repeat(4097),
    `<div title="${'x'.repeat(4097)}">`,
    `<div title="${'x'.repeat(5000)}`,
    '<span>outer<span>inner</span></span>',
    '<tr><td>label</th></tr>',
    `<span>${'x'.repeat(8193)}</span>`,
    '<!-- unclosed',
  ])('rejects unsupported structural complexity %#', (prefix) => {
    expect(() => parseReceiptHtml('telebirr', prefix + v5)).toThrow('Unsupported receipt HTML');
  });
  it('preserves Unicode offsets, quoted attributes and formatting', () => {
    const document =
      'İ' +
      v5
        .replace('<table>', '<TABLE title="a > b">')
        .replace('</table>', '</TABLE>')
        .replace('Example Merchant', '<b>Example Merchant</b>');
    expect(
      compareReceipt(expectation('telebirr'), parseReceiptHtml('telebirr', document).evidence)
        .status,
    ).toBe('MATCH');
  });
  it('decodes entities once, never as markup or a second encoded value', () => {
    expect(
      parseReceiptHtml('telebirr', v5.replace('AH-TEST-4821', '&#65;H-TEST-4821')).evidence
        .reference,
    ).toBe('AH-TEST-4821');
    for (const replacement of ['&amp;#65;H-TEST-4821', '&lt;b&gt;AH-TEST-4821&lt;/b&gt;']) {
      const evidence = parseReceiptHtml(
        'telebirr',
        v5.replace('AH-TEST-4821', replacement),
      ).evidence;
      expect(compareReceipt(expectation('telebirr'), evidence).status).not.toBe('MATCH');
    }
  });
  it.each(['script', 'style', 'noscript', 'textarea', 'title', 'iframe', 'xmp'])(
    'ignores receipt-like markup in raw %s content',
    (tag) => {
      const evidence = parseReceiptHtml(
        'telebirr',
        `<${tag}>${v5.replace(/<title>.*?<\/title>/u, '')}</${tag}>`,
      ).evidence;
      expect(compareReceipt(expectation('telebirr'), evidence).status).toBe('INCOMPLETE');
    },
  );
  it('rejects oversized HTML and malformed expected identifiers at their respective boundaries', () => {
    expect(() => parseReceiptHtml('telebirr', 'x'.repeat(2_000_001))).toThrow();
    expect(() =>
      compareReceipt(expectation('telebirr'), parseReceiptHtml('telebirr', v5).evidence, '.*'),
    ).toThrow();
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
    'Transaction ID: TEST1234AB Transaction Reference: OTHER1234',
    '',
  ])('rejects untrusted or conflicting locator %s', (value) =>
    expect(() => normalizeReceiptLocator('telebirr', value)).toThrow(),
  );
});
