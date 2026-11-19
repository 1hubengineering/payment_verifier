import { createHash } from 'node:crypto';
import type { ReceiptEvidence } from '../comparison.ts';
import { parseReceiptHtml } from './extraction.ts';
import { normalizeReceiptLocator } from './locator.ts';
import type { ReceiptLocator } from './locator.ts';
import { retrieveHtml, RetrievalError } from './https.ts';
import type { RetrievalErrorCode, RetrievalOptions } from './https.ts';
export { parseReceiptHtml, parseProviderTime } from './extraction.ts';
export type { ParsedReceipt } from './extraction.ts';
export { normalizeReceiptLocator } from './locator.ts';
export type { ReceiptLocator } from './locator.ts';
export { retrieveHtml, RetrievalError, isPublicDestination } from './https.ts';
export type { RetrievalOptions, RetrievedHtml, RetrievalErrorCode } from './https.ts';

export type ProviderResult =
  | {
      readonly kind: 'EVIDENCE';
      readonly evidence: ReceiptEvidence;
      readonly provenance: {
        readonly kind: 'OFFICIAL_HTTPS';
        readonly url: string;
        readonly retrievedAt: number;
        readonly sha256: string;
        readonly parserVersion: '1';
      };
    }
  | { readonly kind: 'UNAVAILABLE'; readonly code: RetrievalErrorCode };

export async function retrieveTelebirr(
  input: string,
  options: RetrievalOptions = {},
): Promise<ProviderResult> {
  try {
    let locator: ReceiptLocator;
    try {
      locator = normalizeReceiptLocator('telebirr', input);
    } catch {
      return { kind: 'UNAVAILABLE', code: 'INVALID_LOCATOR' };
    }
    const { html } = await retrieveHtml(locator, options);
    const parsed = parseReceiptHtml('telebirr', html, locator.transactionId!);
    return Object.freeze({
      kind: 'EVIDENCE',
      evidence: parsed.evidence,
      provenance: Object.freeze({
        kind: 'OFFICIAL_HTTPS',
        url: locator.url,
        retrievedAt: Date.now(),
        sha256: createHash('sha256').update(html).digest('hex'),
        parserVersion: '1',
      }),
    });
  } catch (error) {
    if (error instanceof RetrievalError) return { kind: 'UNAVAILABLE', code: error.code };
    return { kind: 'UNAVAILABLE', code: 'PROVIDER_UNAVAILABLE' };
  }
}
