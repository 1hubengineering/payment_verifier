import { compareReceipt, createPaymentExpectation } from '@1hubengineering/verifier/comparison';
import { detectPaymentInput } from '@1hubengineering/verifier/input';
import type { ProviderId } from '@1hubengineering/verifier';
import { waitForDemo } from './demo-wait';
import { demoMethods, demoOrder, demoSamples } from './demo-config';
import type { ReceiptResult, ReceiptSubmission } from './checkout';

export function demoProvider(id: string): ProviderId | undefined {
  return id === 'cbe' || id === 'telebirr' ? id : undefined;
}

export function validateDemoEvidence(
  submission: Omit<ReceiptSubmission, 'signal'>,
): string | undefined {
  const detected = detectPaymentInput(submission.reference);
  if (!detected.ok) return detected.error.message;
  if (detected.value.provider !== submission.paymentMethodId)
    return 'Use the receipt for the selected payment method.';
}

const fixtures = {
  telebirr: {
    verified: demoSamples.telebirr.transaction,
    mismatch: 'DEMOMISMATCH',
    retry: 'DEMORETRY',
  },
  cbe: {
    verified: demoSamples.cbe.transaction,
    mismatch: 'v2-DEMOMISMATCH',
    retry: 'v2-DEMORETRY',
  },
} as const;

function receiptChecks(provider: ProviderId, transactionId: string, amountMinor: number) {
  const recipientName = demoMethods.find((method) => method.id === provider)!.receiving.holder;
  const expected = createPaymentExpectation({
    tenantId: 'checkout-demo',
    paymentId: demoOrder.id,
    provider,
    currency: 'ETB',
    amountMinor: demoOrder.amountMinor,
    recipientName,
    recipientAccountLast4: '1048',
    reference: demoOrder.reference,
    validFrom: demoOrder.validFrom,
    validUntil: demoOrder.validUntil,
  });
  return compareReceipt(
    expected,
    {
      provider,
      transactionId: provider === 'cbe' ? 'CBEDEMO1048' : transactionId,
      currency: 'ETB',
      amountMinor,
      recipientName,
      recipientAccountLast4: '1048',
      reference: demoOrder.reference,
      transactionAt: demoOrder.validFrom + 90 * 60_000,
      status: 'SUCCESSFUL',
      paymentType: provider === 'cbe' ? 'A2A' : null,
      ambiguousFields: [],
    },
    provider === 'cbe' ? undefined : transactionId,
  ).checks;
}

export function createDemoVerifier(wait = waitForDemo) {
  const claimed = new Set<ProviderId>();
  const unavailableOnce = new Set<ProviderId>();
  return async ({
    reference,
    paymentMethodId,
    signal,
  }: ReceiptSubmission): Promise<ReceiptResult> => {
    const detected = detectPaymentInput(reference);
    if (!detected.ok || detected.value.provider !== paymentMethodId)
      return { status: 'INVALID_INPUT', retryable: false };
    const { provider, identifier } = detected.value;
    await wait(signal);
    signal.throwIfAborted();
    const record = fixtures[provider];
    if (identifier === record.mismatch)
      return {
        status: 'MISMATCH',
        retryable: false,
        checks: receiptChecks(provider, identifier, demoOrder.amountMinor - 100),
      };
    if (identifier === record.retry && !unavailableOnce.has(provider)) {
      unavailableOnce.add(provider);
      return { status: 'UNAVAILABLE', retryable: true };
    }
    if (identifier !== record.verified && identifier !== record.retry)
      return { status: 'NOT_FOUND', retryable: false };
    const checks = receiptChecks(provider, identifier, demoOrder.amountMinor);
    if (claimed.has(provider))
      return { status: 'RECEIPT_ALREADY_CLAIMED', retryable: false, checks };
    claimed.add(provider);
    return { status: 'VERIFIED', retryable: false, checks };
  };
}
