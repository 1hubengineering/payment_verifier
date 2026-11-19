import type { PaymentExpectation } from '@1hubengineering/verifier';
import { normalizeReceiptLocator } from '@1hubengineering/verifier/providers';

export type CheckoutEvidence =
  | { receiptLocator: string }
  | { kind: 'transaction' | 'url' | 'sms'; reference: string };

type LocatorResult =
  | { locator: string }
  | { error: 'INVALID_INPUT' | 'INVALID_EVIDENCE' | 'CBE_RECEIPT_URL_REQUIRED' };

const telebirrNumber = /^[a-z0-9]{6,32}$/i;
const cbeNumber = /^(?:v2-[a-z0-9_-]{1,512}|[a-z0-9_-]{6,40})$/i;
const singleUrl = /^https:\/\/[^\s<>"']+[a-z0-9_-]$/i;
const otherProvider = {
  cbe: /^telebirr\b|\bthank you for using telebirr\b/i,
  telebirr: /^cbe\b|\bthanks for banking with cbe\b/i,
};

export function checkoutLocator(
  provider: PaymentExpectation['provider'],
  input: CheckoutEvidence,
): LocatorResult {
  if ('receiptLocator' in input) {
    try {
      return { locator: normalizeReceiptLocator(provider, input.receiptLocator).url };
    } catch {
      return { error: 'INVALID_INPUT' };
    }
  }

  const reference = input.reference.trim();
  if (!reference || input.reference.length > 4096) return { error: 'INVALID_EVIDENCE' };
  if (input.kind === 'transaction') {
    if (provider === 'cbe')
      return { error: cbeNumber.test(reference) ? 'CBE_RECEIPT_URL_REQUIRED' : 'INVALID_EVIDENCE' };
    if (!telebirrNumber.test(reference)) return { error: 'INVALID_EVIDENCE' };
  }
  if (input.kind === 'url' && !singleUrl.test(reference)) return { error: 'INVALID_EVIDENCE' };
  if (input.kind === 'sms' && otherProvider[provider].test(reference))
    return { error: 'INVALID_EVIDENCE' };

  try {
    return { locator: normalizeReceiptLocator(provider, reference).url };
  } catch {
    return {
      error:
        provider === 'cbe' && input.kind === 'sms'
          ? 'CBE_RECEIPT_URL_REQUIRED'
          : 'INVALID_EVIDENCE',
    };
  }
}
