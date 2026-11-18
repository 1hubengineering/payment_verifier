import { waitForDemo } from './demo-wait';
import { demoMethods, demoOrder, demoSamples } from './demo-config';
import { parseDemoEvidence } from './demo-evidence';
import type { DemoEvidence, EvidenceKind, ProviderId } from './demo-evidence';
import type { ReceiptResult, ReceiptSubmission } from './checkout';

export function demoProvider(id: string): ProviderId | undefined {
  return id === 'cbe' || id === 'telebirr' ? id : undefined;
}

function receivingAccountMatches(submitted: string, expected: string): boolean | undefined {
  const candidate = submitted.replaceAll(' ', '').toUpperCase();
  const account = expected.replaceAll(' ', '').toUpperCase();
  const masked = /^(\d*)[*X•]{2,}(\d{4})$/u.exec(candidate.replace(/^\+/, ''));
  if (masked)
    return account.replace(/^\+/, '').startsWith(masked[1]!) && account.endsWith(masked[2]!);
  if (!/^(?:\+?\d{8,15}|DEMO-CBE-\d{4})$/.test(candidate)) return undefined;
  return candidate === account;
}

const cleanName = (name: string) => name.replace(/\s+/g, ' ').trim().toLowerCase();

function compareSms(
  evidence: DemoEvidence,
  provider: ProviderId,
): 'consistent' | 'mismatch' | 'incomplete' {
  const receiving = demoMethods.find((method) => method.id === provider)!.receiving;
  const account =
    evidence.recipientAccount === undefined
      ? undefined
      : receivingAccountMatches(evidence.recipientAccount, receiving.account);
  if (
    (evidence.amountMinor !== undefined && evidence.amountMinor !== demoOrder.amountMinor) ||
    (evidence.recipient !== undefined &&
      cleanName(evidence.recipient) !== cleanName(receiving.holder)) ||
    (evidence.transactionAt !== undefined &&
      (evidence.transactionAt < demoOrder.validFrom ||
        evidence.transactionAt > demoOrder.validUntil)) ||
    (evidence.orderReference !== undefined && evidence.orderReference !== demoOrder.reference) ||
    account === false
  )
    return 'mismatch';
  if (
    evidence.amountMinor === undefined ||
    evidence.transactionAt === undefined ||
    account !== true ||
    !evidence.recipient
  )
    return 'incomplete';
  return 'consistent';
}

const legacyReferences = new Set(['DEMO-MATCH', 'DEMO-MISMATCH', 'DEMO-RETRY']);

function parseInput(provider: ProviderId, kind: EvidenceKind, input: string): DemoEvidence {
  if (kind === 'transaction' && legacyReferences.has(input)) return { transactionId: input };
  return parseDemoEvidence(provider, kind, input);
}

export function validateDemoEvidence(
  submission: Omit<ReceiptSubmission, 'signal'>,
): string | undefined {
  const provider = demoProvider(submission.paymentMethodId);
  if (!provider) return 'Choose CBE or Telebirr.';
  try {
    parseInput(provider, submission.kind ?? 'transaction', submission.reference);
  } catch {
    if (submission.kind === 'url')
      return 'Paste one HTTPS receipt link for the selected payment method.';
    if (submission.kind === 'sms')
      return 'Check that this SMS is for the selected method and has no conflicting details.';
    return 'Enter the transaction number as shown on the receipt.';
  }
}

export function createDemoVerifier(wait = waitForDemo) {
  const accepted = new Map<string, { orderId: string; outcome: 'matched' }>();
  const unavailableOnce = new Set<ProviderId>();

  return async ({
    reference,
    paymentMethodId,
    kind = 'transaction',
    signal,
  }: ReceiptSubmission): Promise<ReceiptResult> => {
    const provider = demoProvider(paymentMethodId);
    if (!provider) return 'rejected';
    let evidence: DemoEvidence;
    try {
      evidence = parseInput(provider, kind, reference);
    } catch {
      return 'rejected';
    }
    await wait(signal);
    signal.throwIfAborted();
    if (evidence.transactionId === 'DEMO-RETRY' && !unavailableOnce.has(provider)) {
      unavailableOnce.add(provider);
      return 'unavailable';
    }
    if (evidence.transactionId === 'DEMO-MISMATCH') return 'mismatch';
    if (kind === 'sms') {
      const consistency = compareSms(evidence, provider);
      if (consistency !== 'consistent') return consistency === 'mismatch' ? 'mismatch' : 'review';
    }
    const trusted = demoSamples[provider];
    if (evidence.receiptUrl && evidence.receiptUrl !== trusted.url) return 'review';
    if (
      evidence.transactionId &&
      ![
        trusted.transaction,
        ...(provider === 'cbe' ? [new URL(trusted.url).pathname.slice(1)] : []),
        'DEMO-MATCH',
        'DEMO-RETRY',
      ].includes(evidence.transactionId)
    )
      return 'review';
    if (!evidence.transactionId && !evidence.receiptUrl) return 'review';
    const transactionKey = `${provider}:${trusted.transaction}`;
    if (accepted.has(transactionKey)) return 'duplicate';
    accepted.set(transactionKey, { orderId: demoOrder.id, outcome: 'matched' });
    return 'matched';
  };
}
