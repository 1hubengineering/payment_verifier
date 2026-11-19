import { describe, expect, it } from 'vite-plus/test';
import { demoSamples } from './demo-config';
import { createDemoVerifier, validateDemoEvidence } from './demo-verification';

describe('synthetic checkout provider', () => {
  it.each(['telebirr', 'cbe'] as const)(
    'accepts %s number, link, and full SMS in the same field',
    async (paymentMethodId) => {
      for (const reference of Object.values(demoSamples[paymentMethodId])) {
        const input = { paymentMethodId, reference, signal: new AbortController().signal };
        expect(validateDemoEvidence(input)).toBeUndefined();
        expect(await createDemoVerifier(async () => {})(input)).toMatchObject({
          status: 'VERIFIED',
        });
      }
    },
  );
  it('uses the SMS as a lookup even if its amounts and sender text change', async () => {
    const input = {
      paymentMethodId: 'cbe',
      reference: demoSamples.cbe.sms
        .replace('ETB 1,480.00', 'ETB 10.00')
        .replace('Sample Customer', 'Edited Sender'),
      signal: new AbortController().signal,
    };
    expect(await createDemoVerifier(async () => {})(input)).toMatchObject({ status: 'VERIFIED' });
  });
  it('keeps timeout, mismatch and absence distinct', async () => {
    const check = createDemoVerifier(async () => {});
    const input = { paymentMethodId: 'telebirr', signal: new AbortController().signal };
    expect(await check({ ...input, reference: 'DEMOMISMATCH' })).toMatchObject({
      status: 'MISMATCH',
      retryable: false,
    });
    expect(await check({ ...input, reference: 'UNKNOWN123' })).toEqual({
      status: 'NOT_FOUND',
      retryable: false,
    });
    expect(await check({ ...input, reference: 'DEMORETRY' })).toEqual({
      status: 'UNAVAILABLE',
      retryable: true,
    });
    expect(await check({ ...input, reference: 'DEMORETRY' })).toMatchObject({
      status: 'VERIFIED',
      retryable: false,
    });
  });
});
