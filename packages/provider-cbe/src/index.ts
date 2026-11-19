import { createHash } from 'node:crypto';
import {
  normalizeReceiptLocator,
  parseReceiptHtml,
  retrieveHtml,
  RetrievalError,
} from '@1hubengineering/verifier/providers';
import type {
  ProviderResult,
  RetrievalOptions,
  ReceiptLocator,
} from '@1hubengineering/verifier/providers';
import { renderCbeHtml } from './render.ts';

export interface CbeProvider {
  retrieve(
    input: string,
    options?: RetrievalOptions,
  ): Promise<ProviderResult | { readonly kind: 'UNAVAILABLE'; readonly code: 'BUSY' }>;
}

/** Explicit per-instance admission. This instance owns browsers it launches. */
export function createCbeProvider(options: { readonly maxConcurrency?: number } = {}): CbeProvider {
  const limit = options.maxConcurrency ?? 1;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 4)
    throw new TypeError('Invalid browser concurrency');
  let active = 0;
  return {
    async retrieve(input, bounds = {}) {
      if (active >= limit) return { kind: 'UNAVAILABLE', code: 'BUSY' };
      active++;
      const started = Date.now();
      try {
        let locator: ReceiptLocator;
        try {
          locator = normalizeReceiptLocator('cbe', input);
        } catch {
          return { kind: 'UNAVAILABLE', code: 'INVALID_LOCATOR' };
        }
        const retrieved = await retrieveHtml(locator, bounds);
        const remaining = (bounds.timeoutMs ?? 15_000) - (Date.now() - started);
        if (remaining <= 0) throw new RetrievalError('TIMEOUT');
        const rendered = await renderCbeHtml(locator.url, retrieved.html, {
          ...bounds,
          timeoutMs: remaining,
        });
        const parsed = parseReceiptHtml('cbe', rendered);
        return {
          kind: 'EVIDENCE',
          evidence: parsed.evidence,
          provenance: {
            kind: 'OFFICIAL_HTTPS',
            url: locator.url,
            retrievedAt: Date.now(),
            sha256: createHash('sha256').update(retrieved.html).digest('hex'),
            parserVersion: '1',
          },
        };
      } catch (error) {
        if (error instanceof RetrievalError) return { kind: 'UNAVAILABLE', code: error.code };
        if (error instanceof Error && error.name === 'TimeoutError')
          return { kind: 'UNAVAILABLE', code: 'TIMEOUT' };
        return { kind: 'UNAVAILABLE', code: 'PROVIDER_UNAVAILABLE' };
      } finally {
        active--;
      }
    },
  };
}
