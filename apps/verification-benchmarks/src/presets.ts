import type { ProviderId } from '@1hubengineering/verifier';

export const mockCases = [
  'success',
  'amount',
  'recipient',
  'invoice',
  'missing',
  'timeout',
  'network',
] as const;
export type MockCase = (typeof mockCases)[number];

export const syntheticPayment = {
  amount: '100.55',
  recipientName: 'Example Merchant',
  recipientAccountLast4: '1123',
  reference: 'INV-SYNTH-1024',
};

export function syntheticIdentifier(provider: ProviderId, id: string): string {
  const value = id.replaceAll('-', '').slice(0, 24).toUpperCase();
  return provider === 'cbe' ? `v2-${value}` : `SYN${value}`;
}
