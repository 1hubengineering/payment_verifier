import { setTimeout } from 'node:timers/promises';
import type { DurableVerifier } from '@1hubengineering/verifier/jobs';
export async function runWorker(
  jobs: DurableVerifier,
  options: {
    readonly signal: AbortSignal;
    readonly once: boolean;
    readonly pollMs?: number;
    readonly emit: (outcome: string) => void;
  },
): Promise<void> {
  const pollMs = options.pollMs ?? 1000;
  if (!Number.isSafeInteger(pollMs) || pollMs < 1 || pollMs > 60000)
    throw new TypeError('Invalid worker poll interval');
  while (!options.signal.aborted) {
    const outcome = await jobs.runOnce({ signal: options.signal });
    options.emit(outcome);
    if (options.once) return;
    if (outcome !== 'COMPLETED') {
      try {
        await setTimeout(pollMs, undefined, { signal: options.signal });
      } catch (error) {
        if (!options.signal.aborted) throw error;
      }
    }
  }
}
