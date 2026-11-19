import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';
import type { ReceiptProvider, VerificationStorage } from '@1hubengineering/verifier';

export type Phase =
  | 'inputPreview'
  | 'prepare'
  | 'provider'
  | 'complete'
  | 'storageRead'
  | 'storageTransaction';
export interface PhaseTiming {
  calls: number;
  ms: number;
}
export interface AttemptTiming {
  totalMs: number;
  phases: Partial<Record<Phase, PhaseTiming>>;
}

export function createInstrumentation() {
  const context = new AsyncLocalStorage<AttemptTiming>();

  async function time<T>(phase: Phase, work: () => T | Promise<T>): Promise<T> {
    const timing = context.getStore();
    if (!timing) return work();
    const start = performance.now();
    try {
      return await work();
    } finally {
      const sample = (timing.phases[phase] ??= { ms: 0, calls: 0 });
      sample.calls++;
      sample.ms += performance.now() - start;
    }
  }

  return {
    time,
    async attempt<T>(work: () => Promise<T>): Promise<{ value: T; timing: AttemptTiming }> {
      const timing: AttemptTiming = { totalMs: 0, phases: {} };
      const start = performance.now();
      const value = await context.run(timing, work);
      timing.totalMs = performance.now() - start;
      return { value, timing };
    },
    provider(adapter: ReceiptProvider): ReceiptProvider {
      return { retrieve: (...args) => time('provider', () => adapter.retrieve(...args)) };
    },
    storage(adapter: VerificationStorage): VerificationStorage {
      return {
        ...(adapter.callerTransaction === undefined
          ? {}
          : { callerTransaction: adapter.callerTransaction }),
        read: (key) => time('storageRead', () => adapter.read(key)),
        transaction: (work) => time('storageTransaction', () => adapter.transaction(work)),
      };
    },
  };
}
