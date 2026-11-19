import { detectPaymentInput } from '../input.ts';
import type { DetectedPaymentInput } from '../input.ts';
import { receiptEndpoints, validIdentifier } from '../input-syntax.ts';
import type { ProviderId } from '../types.ts';

export interface ReceiptLocator {
  readonly provider: ProviderId;
  readonly url: string;
  readonly transactionId: string | null;
}

export function officialLocator(input: DetectedPaymentInput): ReceiptLocator {
  const { provider, identifier } = input;
  if (!validIdentifier(provider, identifier)) throw new TypeError('Invalid receipt identifier');
  return {
    provider,
    url: receiptEndpoints[provider] + identifier,
    transactionId: provider === 'telebirr' ? identifier : null,
  };
}

/** Strict transport boundary, independent of SMS and paste handling. */
export function outboundLocator(provider: ProviderId, url: string): ReceiptLocator {
  const prefix = receiptEndpoints[provider];
  if (typeof url !== 'string' || !prefix || !url.startsWith(prefix))
    throw new TypeError('Unsupported receipt URL');
  const identifier = url.slice(prefix.length);
  if (!validIdentifier(provider, identifier)) throw new TypeError('Invalid receipt identifier');
  return { provider, url, transactionId: provider === 'telebirr' ? identifier : null };
}

export function normalizeReceiptLocator(provider: ProviderId, input: string): ReceiptLocator {
  const parsed = detectPaymentInput(input);
  if (!parsed.ok || parsed.value.provider !== provider)
    throw new TypeError('Invalid receipt locator');
  return officialLocator(parsed.value);
}
