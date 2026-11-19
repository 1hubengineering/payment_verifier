import type { ProviderId } from '../types.ts';

export interface ReceiptLocator {
  readonly provider: ProviderId;
  readonly url: string;
  readonly transactionId: string | null;
}

/** SMS is only an untrusted locator; its amounts, identities and status are ignored. */
export function normalizeReceiptLocator(provider: ProviderId, input: string): ReceiptLocator {
  if (
    (provider !== 'telebirr' && provider !== 'cbe') ||
    typeof input !== 'string' ||
    input.length > 4096 ||
    !input.trim()
  )
    throw new TypeError('Invalid receipt locator');
  const urls = (input.match(/https?:\/\/[^\s<>"']+/gi) ?? []).map((u) =>
    u.replace(/[.,;)]+$/u, ''),
  );
  const official: string[] = [];
  for (const candidate of urls) {
    const pattern =
      provider === 'telebirr'
        ? /^https:\/\/transactioninfo\.ethiotelecom\.et\/receipt\/[A-Z0-9]{6,32}$/i
        : /^https:\/\/mbreciept\.cbe\.com\.et\/v2-[A-Z0-9_-]{1,512}$/i;
    if (pattern.test(candidate)) official.push(candidate);
    else if (
      !(provider === 'cbe' && /^https:\/\/forms\.gle\/kGNGQpG3mQCCk3iD6\/?$/.test(candidate))
    )
      throw new TypeError('Unsupported receipt URL');
  }
  if (provider === 'cbe') {
    if (official.length !== 1) throw new TypeError('CBE requires one official receipt URL');
    return Object.freeze({ provider, url: new URL(official[0]!).href, transactionId: null });
  }
  const ids = [
    ...input.matchAll(
      /(?:transaction\s*(?:number|no\.?|id|reference)|invoice(?:\s*(?:number|no\.?|id))?)\s*(?:is\s+|[:#-]\s*)?([A-Z0-9]{6,32})(?![A-Z0-9])/gi,
    ),
  ].map((m) => m[1]!.toUpperCase());
  if (/^[A-Z0-9]{6,32}$/i.test(input.trim())) ids.push(input.trim().toUpperCase());
  for (const url of official) ids.push(new URL(url).pathname.split('/').at(-1)!.toUpperCase());
  if (new Set(ids).size !== 1 || official.length > 1)
    throw new TypeError('Missing or conflicting receipt locator');
  const transactionId = ids[0]!;
  return Object.freeze({
    provider,
    url: `https://transactioninfo.ethiotelecom.et/receipt/${transactionId}`,
    transactionId,
  });
}
