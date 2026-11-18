import { describe, expect, it } from 'vite-plus/test';
import { demoOrder, demoSamples } from './demo-config';
import { parseDemoEvidence } from './demo-evidence';
import type { EvidenceKind, ProviderId } from './demo-evidence';
import { createDemoVerifier, validateDemoEvidence } from './demo-verification';

const telebirrMessage = `Dear Sample Sender
You have transferred ETB 12.34 to Sample Recipient (25190****0042) on 18/11/2026 03:57:49. Your transaction number is SAMPLETEST01. The service fee is  ETB 0.87 and  15% VAT on the service fee is ETB 0.13. Your current E-Money Account  balance is ETB 456.78. To download your payment information please click this link: https://transactioninfo.ethiotelecom.et/receipt/SAMPLETEST01.

Thank you for using telebirr
Ethio telecom`;
const cbeMessage =
  'Dear Sample Sender You have successfully transferred ETB 234.56 from account 1********0001 to account 1********0042 (Sample Recipient). Service charge of ETB 0.50 and VAT(15%) of ETB 0.08 and Disaster Recovery(5%) of 0.03 with total of ETB 235.17. Your current balance is ETB 1,234.56. Thanks for Banking with CBE. https://mbreciept.cbe.com.et/v2-Sample_Receipt42  for feedback: https://forms.gle/kGNGQpG3mQCCk3iD6';

const noWait = async () => {};
const submission = (paymentMethodId: ProviderId, kind: EvidenceKind, reference: string) => ({
  paymentMethodId,
  kind,
  reference,
  signal: new AbortController().signal,
});

describe('redacted provider SMS formats', () => {
  it('extracts Telebirr amount, explicit transaction ID, EAT timestamp and fees without saving balance', () => {
    expect(parseDemoEvidence('telebirr', 'sms', telebirrMessage)).toEqual({
      amountMinor: 1234,
      transactionId: 'SAMPLETEST01',
      transactionAt: Date.parse('2026-11-18T03:57:49+03:00'),
      sender: 'Sample Sender',
      recipient: 'Sample Recipient',
      recipientAccount: '25190****0042',
      feeMinor: 87,
      vatMinor: 13,
      receiptUrl: 'https://transactioninfo.ethiotelecom.et/receipt/SAMPLETEST01',
    });
  });

  it('extracts CBE beneficiary, separate charges and receipt URL without inventing an ID or date', () => {
    expect(parseDemoEvidence('cbe', 'sms', cbeMessage)).toEqual({
      amountMinor: 23456,
      sender: 'Sample Sender',
      senderAccount: '1********0001',
      recipient: 'Sample Recipient',
      recipientAccount: '1********0042',
      feeMinor: 50,
      vatMinor: 8,
      recoveryMinor: 3,
      totalDebitedMinor: 23517,
      receiptUrl: 'https://mbreciept.cbe.com.et/v2-Sample_Receipt42',
    });
  });

  it.each([
    ['cbe', telebirrMessage],
    ['telebirr', cbeMessage],
    ['telebirr', telebirrMessage.replace('18/11/2026', '31/11/2026')],
    ['telebirr', telebirrMessage.replace('ETB 12.34', 'ETB 1,2.34')],
    ['telebirr', telebirrMessage.replace('/SAMPLETEST01.', '/DIFFERENT01.')],
    ['telebirr', telebirrMessage + '\nAmount: ETB 1.00'],
    ['cbe', cbeMessage + ' https://example.invalid/feedback'],
  ] as const)('rejects mismatched, conflicting, or invalid %s SMS', (provider, message) => {
    expect(() => parseDemoEvidence(provider, 'sms', message)).toThrow();
  });

  it.each([
    'http://mbreciept.cbe.com.et/v2-DEMO1048',
    'https://mbreciept.cbe.com.et:443/v2-DEMO1048',
    'https://mbreciept.cbe.com.et@wrong.invalid/v2-DEMO1048',
    'https://mbreciept.cbe.com.et/v2-DEMO1048?extra=1',
    'https://transactioninfo.ethiotelecom.et/receipt/DEMO1048TB',
    'https://mbreciept.cbe.com.et/v2-DEMO1048\nhttps://wrong.invalid/',
  ])('rejects unsupported CBE URL %s', (reference) => {
    expect(validateDemoEvidence(submission('cbe', 'url', reference))).toContain(
      'selected payment method',
    );
  });
});

describe('offline mock verification', () => {
  it.each(['telebirr', 'cbe'] as const)(
    'matches %s sample SMS and deduplicates aliases across all tabs',
    async (provider) => {
      const verify = createDemoVerifier(noWait);
      const sample = demoSamples[provider];
      await expect(verify(submission(provider, 'sms', sample.sms))).resolves.toBe('matched');
      await expect(verify(submission(provider, 'transaction', sample.transaction))).resolves.toBe(
        'duplicate',
      );
      await expect(verify(submission(provider, 'url', sample.url))).resolves.toBe('duplicate');
    },
  );

  it('accepts only one overlapping attempt of the same mock transaction', async () => {
    const verify = createDemoVerifier(noWait);
    const sample = demoSamples.cbe;
    await expect(
      Promise.all([
        verify(submission('cbe', 'transaction', sample.transaction)),
        verify(submission('cbe', 'url', sample.url)),
      ]),
    ).resolves.toEqual(['matched', 'duplicate']);
  });

  it.each([
    ['1,480.00', '1,480.01'],
    ['25100****1048', '25199****1048'],
    ['25100****1048', '25100****9999'],
    ['Juniper Supply', 'Different Merchant'],
    ['19/11/2026', '18/11/2026'],
  ])('does not record a known reference when an SMS field disagrees (%s)', async (from, to) => {
    const verify = createDemoVerifier(noWait);
    const sample = demoSamples.telebirr;
    await expect(verify(submission('telebirr', 'sms', sample.sms.replace(from, to)))).resolves.toBe(
      'mismatch',
    );
    await expect(verify(submission('telebirr', 'sms', sample.sms))).resolves.toBe('matched');
  });

  it('leaves unrecognized, incomplete or non-mock evidence pending without reserving the mock transaction', async () => {
    const verify = createDemoVerifier(noWait);
    const sample = demoSamples.cbe;
    for (const sms of ['Unrecognized format', sample.sms.split('\n')[0]!, cbeMessage]) {
      await expect(verify(submission('cbe', 'sms', sms))).resolves.toBe(
        sms === cbeMessage ? 'mismatch' : 'review',
      );
    }
    await expect(verify(submission('cbe', 'transaction', 'UNKNOWN123'))).resolves.toBe('review');
    await expect(verify(submission('cbe', 'url', sample.url))).resolves.toBe('matched');
  });

  it('keeps first-attempt unavailability separate and never records aborted evidence', async () => {
    const verify = createDemoVerifier(noWait);
    await expect(
      verify({
        ...submission('cbe', 'transaction', demoSamples.cbe.transaction),
        signal: AbortSignal.abort(),
      }),
    ).rejects.toThrow();
    await expect(verify(submission('cbe', 'transaction', 'DEMO-RETRY'))).resolves.toBe(
      'unavailable',
    );
    await expect(verify(submission('cbe', 'transaction', 'DEMO-RETRY'))).resolves.toBe('matched');
    expect(parseDemoEvidence('cbe', 'sms', demoSamples.cbe.sms).amountMinor).toBe(
      demoOrder.amountMinor,
    );
  });
});
