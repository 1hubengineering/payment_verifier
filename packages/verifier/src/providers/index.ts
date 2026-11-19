import { createHash } from 'node:crypto';
import type { ReceiptEvidence } from '../comparison.ts';
import { parseReceiptHtml, UnsupportedReceiptHtml } from './extraction.ts';
import { normalizeReceiptLocator } from './locator.ts';
import type { ReceiptLocator } from './locator.ts';
import { retrieveHtml, RetrievalError } from './https.ts';
import type { RetrievalOptions } from './https.ts';
import { VerificationOperationError } from '../outcomes.ts';
import type { DiagnosticDetails, ProviderFailureCode, ProviderFailureStage } from '../outcomes.ts';

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
      readonly pendingRetryable?: boolean;
      readonly provenance: {
        readonly kind: 'OFFICIAL_HTTPS';
        readonly url: string;
        readonly retrievedAt: number;
        readonly sha256: string;
        readonly parserVersion: string;
      };
    }
  | {
      readonly kind: 'NOT_FOUND';
      readonly retryable?: boolean;
      readonly details?: DiagnosticDetails;
    }
  | {
      readonly kind: 'UNAVAILABLE';
      readonly code: ProviderFailureCode;
      readonly stage: ProviderFailureStage;
      readonly retryable: boolean;
      readonly details: DiagnosticDetails;
    };

/** Map typed transport or renderer failures without leaking exception text. */
export function providerFailure(error: unknown, stage: ProviderFailureStage): ProviderResult {
  if (!(error instanceof RetrievalError))
    throw new VerificationOperationError('INTERNAL_ERROR', 'adapter', { cause: error });
  if (error.code === 'CANCELLED')
    throw new VerificationOperationError('OPERATION_CANCELLED', 'request', { cause: error });
  if (error.code === 'INVALID_LOCATOR')
    throw new VerificationOperationError('INVALID_REQUEST', 'adapter', { cause: error });
  return {
    kind: 'UNAVAILABLE',
    code: error.code,
    stage,
    retryable: error.retryable,
    details: error.details,
  };
}

export function interpretOfficialHtml(
  locator: ReceiptLocator,
  retrievedHtml: string,
  parsedHtml: string,
  retrievedAt: number,
): ProviderResult {
  try {
    const parsed = parseReceiptHtml(locator.provider, parsedHtml);
    if (!parsed.recognized) throw new UnsupportedReceiptHtml();
    return {
      kind: 'EVIDENCE',
      evidence: parsed.evidence,
      provenance: {
        kind: 'OFFICIAL_HTTPS',
        url: locator.url,
        retrievedAt,
        sha256: createHash('sha256').update(retrievedHtml).digest('hex'),
        parserVersion: locator.provider === 'telebirr' ? 'telebirr-html-3' : '2',
      },
    };
  } catch (error) {
    if (!(error instanceof UnsupportedReceiptHtml)) throw error;
    return {
      kind: 'UNAVAILABLE',
      code: 'UNSUPPORTED_RECEIPT_FORMAT',
      stage: 'receipt_parsing',
      retryable: false,
      details: {},
    };
  }
}

export async function retrieveTelebirr(
  input: string,
  options: RetrievalOptions = {},
): Promise<ProviderResult> {
  let locator: ReceiptLocator;
  try {
    locator = normalizeReceiptLocator('telebirr', input);
  } catch (cause) {
    throw new VerificationOperationError('INVALID_REQUEST', 'adapter', { cause });
  }
  let html: string;
  try {
    ({ html } = await retrieveHtml(locator, options));
  } catch (error) {
    return providerFailure(error, 'receipt_retrieval');
  }
  return interpretOfficialHtml(locator, html, html, Date.now());
}
