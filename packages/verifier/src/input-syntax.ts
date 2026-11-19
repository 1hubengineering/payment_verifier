import type { ProviderId } from './types.ts';

export const receiptEndpoints: Readonly<Record<ProviderId, string>> = {
  telebirr: 'https://transactioninfo.ethiotelecom.et/receipt/',
  cbe: 'https://mbreciept.cbe.com.et/',
};
export const cbeReceiptDataHost: string = 'mb.cbe.com.et';

export const telebirrIdentifier: RegExp = /^[a-z0-9]{6,32}$/i;
export const cbeIdentifier: RegExp = /^v2-[a-z0-9_-]{1,512}$/i;

export function validIdentifier(provider: ProviderId, identifier: string): boolean {
  return (provider === 'cbe' ? cbeIdentifier : telebirrIdentifier).test(identifier);
}
