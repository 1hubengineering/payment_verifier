import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { parseEtbAmount, VerificationOperationError } from '@1hubengineering/verifier';
import type { ProviderId, ReceiptProvider } from '@1hubengineering/verifier';
import { normalizeReceiptLocator } from '@1hubengineering/verifier/providers';

import { syntheticPayment } from './presets.ts';
import type { MockCase } from './presets.ts';

export function syntheticProvider(
  provider: ProviderId,
  scenario: () => MockCase,
  options: { delayMs?: number; now?: () => number } = {},
): ReceiptProvider {
  return {
    async retrieve(input, bounds) {
      const variant = scenario();
      const locator = normalizeReceiptLocator(provider, input);
      const budget = bounds?.timeoutMs ?? 15_000;
      const pause = variant === 'timeout' ? budget : (options.delayMs ?? 0);
      try {
        if (pause > 0) await delay(Math.min(budget, pause), undefined, { signal: bounds?.signal });
      } catch (error) {
        if (bounds?.signal?.aborted)
          throw new VerificationOperationError('OPERATION_CANCELLED', 'request');
        throw error;
      }
      if (variant === 'timeout' || pause >= budget)
        return {
          kind: 'UNAVAILABLE',
          code: 'PROVIDER_TIMEOUT',
          stage: 'receipt_retrieval',
          retryable: true,
          details: { timeoutMs: budget },
        };
      if (variant === 'network')
        return {
          kind: 'UNAVAILABLE',
          code: 'PROVIDER_NETWORK_ERROR',
          stage: 'receipt_retrieval',
          retryable: true,
          details: {},
        };
      if (variant === 'missing') return { kind: 'NOT_FOUND' };
      const now = (options.now ?? Date.now)();
      return {
        kind: 'EVIDENCE',
        provenance: {
          kind: 'OFFICIAL_HTTPS',
          url: locator.url,
          retrievedAt: now,
          sha256: createHash('sha256').update(`synthetic:${locator.url}:${variant}`).digest('hex'),
          parserVersion: 'synthetic-1',
        },
        evidence: {
          provider,
          transactionId:
            locator.transactionId ??
            createHash('sha256').update(locator.url).digest('hex').slice(0, 32).toUpperCase(),
          status: 'SUCCESSFUL',
          currency: 'ETB',
          amountMinor: parseEtbAmount(variant === 'amount' ? '100.00' : syntheticPayment.amount),
          recipientName:
            variant === 'recipient' ? 'Other Merchant' : syntheticPayment.recipientName,
          recipientAccountLast4: syntheticPayment.recipientAccountLast4,
          reference: variant === 'invoice' ? 'OTHER-INVOICE' : syntheticPayment.reference,
          transactionAt: now,
          paymentType: provider === 'cbe' ? 'A2A' : null,
          ambiguousFields: [],
        },
      };
    },
  };
}
