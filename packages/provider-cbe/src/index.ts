import { VerificationOperationError } from '@1hubengineering/verifier';
import {
  interpretOfficialHtml,
  normalizeReceiptLocator,
  providerFailure,
  retrieveHtml,
  RetrievalError,
} from '@1hubengineering/verifier/providers';
import type {
  ProviderResult,
  RetrievalOptions,
  ReceiptLocator,
  RetrievedHtml,
} from '@1hubengineering/verifier/providers';
import { retrieveCbeDataInBrowser } from './browser-data.ts';
import { interpretCbeData, isClientReceipt } from './data.ts';
import { renderCbeHtml } from './render.ts';

export interface CbeProvider {
  retrieve(input: string, options?: RetrievalOptions): Promise<ProviderResult>;
}

/** Explicit per-instance admission. This instance owns browsers it launches. */
export function createCbeProvider(options: { readonly maxConcurrency?: number } = {}): CbeProvider {
  const limit = options.maxConcurrency ?? 1;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 4)
    throw new TypeError('Invalid browser concurrency');
  let active = 0;
  return {
    async retrieve(input, bounds = {}) {
      if (bounds.signal?.aborted)
        throw new VerificationOperationError('OPERATION_CANCELLED', 'request');
      if (active >= limit)
        return {
          kind: 'UNAVAILABLE',
          code: 'PROVIDER_BUSY',
          stage: 'receipt_rendering',
          retryable: true,
          details: {},
        };
      active++;
      const started = Date.now();
      try {
        let locator: ReceiptLocator;
        try {
          locator = normalizeReceiptLocator('cbe', input);
        } catch (cause) {
          throw new VerificationOperationError('INVALID_REQUEST', 'adapter', { cause });
        }
        let receipt: RetrievedHtml;
        try {
          receipt = await retrieveHtml(locator, bounds);
        } catch (error) {
          return providerFailure(error, 'receipt_retrieval');
        }
        const retrievedAt = Date.now();
        const timeoutMs = bounds.timeoutMs ?? 15_000;
        const remaining = timeoutMs - (retrievedAt - started);
        const { html } = receipt;
        if (isClientReceipt(html)) {
          let json: string;
          try {
            if (remaining <= 0) throw new RetrievalError('PROVIDER_TIMEOUT', { timeoutMs }, true);
            const maxBytes = (bounds.maxBytes ?? 2_000_000) - receipt.bytes;
            if (maxBytes <= 0) throw new RetrievalError('RECEIPT_TOO_LARGE');
            json = await retrieveCbeDataInBrowser(locator, html, {
              ...bounds,
              timeoutMs: remaining,
              maxBytes,
            });
          } catch (error) {
            const stage =
              error instanceof RetrievalError && error.code === 'RECEIPT_BROWSER_UNAVAILABLE'
                ? 'receipt_rendering'
                : 'receipt_retrieval';
            return providerFailure(error, stage);
          }
          return interpretCbeData(locator, json, Date.now());
        }
        let rendered: string;
        try {
          if (remaining <= 0)
            throw new RetrievalError('RECEIPT_RENDER_TIMEOUT', { timeoutMs }, true);
          rendered = await renderCbeHtml(locator.url, html, { ...bounds, timeoutMs: remaining });
        } catch (error) {
          if (error instanceof Error && error.name === 'TimeoutError')
            return providerFailure(
              new RetrievalError('RECEIPT_RENDER_TIMEOUT', { timeoutMs }, true, { cause: error }),
              'receipt_rendering',
            );
          return providerFailure(error, 'receipt_rendering');
        }
        return interpretOfficialHtml(locator, html, rendered, retrievedAt);
      } finally {
        active--;
      }
    },
  };
}
