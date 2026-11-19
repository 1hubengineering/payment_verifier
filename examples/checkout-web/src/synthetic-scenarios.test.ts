import { describe, expect, it } from 'vite-plus/test';
import {
  createSimulation,
  evidenceTypes,
  sampleDraft,
  sampleEvidence,
} from './synthetic-scenarios';

describe('browser-only synthetic scenarios', () => {
  const cases = [
    ['success', 'VERIFIED', 'PAYMENT_VERIFIED'],
    ['under', 'MISMATCH', 'AMOUNT_UNDERPAID'],
    ['over', 'MISMATCH', 'AMOUNT_OVERPAID'],
    ['accepted', 'VERIFIED', 'PAYMENT_VERIFIED'],
    ['rejected', 'MISMATCH', 'AMOUNT_UNDERPAID'],
    ['recipient', 'MISMATCH', 'RECIPIENT_NAME_MISMATCH'],
    ['invoice', 'MISMATCH', 'INVOICE_REFERENCE_MISMATCH'],
    ['invalid', 'INVALID_INPUT', 'INVALID_IDENTIFIER'],
    ['ambiguous', 'INVALID_INPUT', 'AMBIGUOUS_INPUT'],
    ['wrongProvider', 'INVALID_INPUT', 'PROVIDER_MISMATCH'],
    ['missing', 'NOT_FOUND', 'RECEIPT_NOT_FOUND'],
    ['timeout', 'UNAVAILABLE', 'PROVIDER_TIMEOUT'],
    ['unsupported', 'UNAVAILABLE', 'UNSUPPORTED_RECEIPT_FORMAT'],
  ] as const;
  for (const provider of ['telebirr', 'cbe'] as const) {
    it.each(cases)(`${provider} %s`, (variant, status, code) => {
      for (const format of evidenceTypes) {
        const draft = sampleDraft(provider, variant);
        const example = sampleEvidence(provider, format, variant);
        expect(createSimulation().run(draft, example, variant, 'payment', 'key')).toMatchObject({
          mode: 'SIMULATED',
          status,
          code,
        });
      }
    });
  }

  it('simulates a committed replay, conflict, and duplicate claim in memory', () => {
    const simulation = createSimulation();
    const draft = sampleDraft('cbe', 'success');
    const id = sampleEvidence(draft.provider, 'Transaction ID', 'success');
    const sms = sampleEvidence(draft.provider, 'SMS', 'success');
    const run = (evidence: string, payment = 'payment', key = 'key') =>
      simulation.run(draft, evidence, 'success', payment, key);
    expect(run(id)).toMatchObject({ status: 'VERIFIED' });
    expect(run(sms)).toMatchObject({ status: 'VERIFIED', replayed: true });
    expect(run('v2-')).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(run(id, 'other-payment', 'other-key')).toMatchObject({
      code: 'RECEIPT_ALREADY_CLAIMED',
    });
  });
});
