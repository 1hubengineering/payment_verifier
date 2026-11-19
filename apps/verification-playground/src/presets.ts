import type { ProviderId } from '@1hubengineering/verifier';
import type { Draft } from './contracts.ts';

import { syntheticPayment } from '@1hubengineering/verification-benchmarks/presets';
export { mockCases, syntheticIdentifier } from '@1hubengineering/verification-benchmarks/presets';
export type { MockCase } from '@1hubengineering/verification-benchmarks/presets';

export function defaultDraft(provider: ProviderId = 'telebirr', now = Date.now()): Draft {
  return {
    ...syntheticPayment,
    provider,
    validFrom: new Date(now - 60 * 60_000).toISOString(),
    validUntil: new Date(now + 24 * 60 * 60_000).toISOString(),
    tolerance: false,
    under: { unit: 'fixed', value: '0.60' },
    over: { unit: 'fixed', value: '0.50' },
  };
}
