import type { JobPolicy } from '@1hubengineering/verifier/jobs';
import { createPaymentExpectation, parseEtbAmount } from '@1hubengineering/verifier';
import type { PaymentExpectation, VerificationSubmission } from '@1hubengineering/verifier';
import type { ProviderResult } from '@1hubengineering/verifier/providers';

export const time: number = 1_700_000_000_000;
export function expectation(tenantId = 'tenant-a', paymentId = 'payment-a'): PaymentExpectation {
  return createPaymentExpectation({
    tenantId,
    paymentId,
    provider: 'telebirr',
    currency: 'ETB',
    amountMinor: parseEtbAmount('0.29'),
    recipientName: 'Synthetic Merchant',
    recipientAccountLast4: '1234',
    reference: 'ORDER_1234',
    validFrom: time,
    validUntil: time + 60_000,
  });
}
export function providerResult(url: string): ProviderResult {
  return {
    kind: 'EVIDENCE',
    provenance: {
      kind: 'OFFICIAL_HTTPS',
      url,
      sha256: 'a'.repeat(64),
      parserVersion: '1',
      retrievedAt: time + 1000,
    },
    evidence: {
      provider: 'telebirr',
      currency: 'ETB',
      transactionId: url.split('/').at(-1)!,
      status: 'SUCCESSFUL',
      amountMinor: parseEtbAmount('0.29'),
      recipientName: 'Synthetic Merchant',
      recipientAccountLast4: '1234',
      reference: 'ORDER_1234',
      transactionAt: time + 500,
      paymentType: null,
      ambiguousFields: [],
    },
  };
}
export function submission(
  tenantId = 'tenant-a',
  paymentId = 'payment-a',
  idempotencyKey = 'key-a',
  receiptLocator = 'SYNTH1234',
): VerificationSubmission {
  return { tenantId, paymentId, idempotencyKey, receiptLocator };
}

// Synthetic, public test key. Never a deployable secret.
export const jobTestKey: Uint8Array = Uint8Array.from({ length: 32 }, (_, i) => i);
export const jobTestPolicy: JobPolicy = {
  maxPending: 3,
  maxRetained: 4,
  concurrency: 1,
  maxAttempts: 3,
  timeoutMs: 1000,
  leaseMs: 3000,
  backoffMs: 10,
};
