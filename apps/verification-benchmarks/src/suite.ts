import { AsyncLocalStorage } from 'node:async_hooks';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { availableParallelism, cpus, tmpdir, totalmem } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { setImmediate } from 'node:timers/promises';
import Database from 'better-sqlite3';
import {
  createPaymentExpectation,
  createReceiptVerifier,
  parseEtbAmount,
  VerificationOperationError,
} from '@1hubengineering/verifier';
import type { ProviderId } from '@1hubengineering/verifier';
import { detectPaymentInput } from '@1hubengineering/verifier/input';
import { sqliteStorage } from '@1hubengineering/storage-sql/sqlite';
import { createInstrumentation } from './performance.ts';
import type { AttemptTiming, Phase } from './performance.ts';
import { syntheticIdentifier, syntheticPayment } from './presets.ts';
import type { MockCase } from './presets.ts';
import { syntheticProvider } from './synthetic.ts';

export const workloads = ['success', 'mixed', 'recovery', 'claims'] as const;
export type Workload = (typeof workloads)[number];
export interface BenchmarkOptions {
  workload: Workload;
  concurrency: number;
  requests: number;
  warmup: number;
  delayMs: number;
  timeoutMs: number;
  provider: ProviderId | 'mixed';
  database: 'disk' | 'memory';
}

const tenantId = 'synthetic-benchmark';
const epoch = 1_800_000_000_000;

export function distribution(values: readonly number[]) {
  if (values.length === 0) return null;
  const sorted = values.toSorted((a, b) => a - b);
  const percentile = (p: number) => sorted[Math.ceil(p * sorted.length) - 1]!;
  return {
    count: sorted.length,
    min: sorted[0]!,
    mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    p50: percentile(0.5),
    p95: percentile(0.95),
    p99: percentile(0.99),
    max: sorted.at(-1)!,
  };
}

function phaseDistributions(attempts: AttemptTiming[]) {
  const phases: Partial<Record<Phase, number[]>> = {};
  for (const attempt of attempts) {
    for (const [phase, timing] of Object.entries(attempt.phases) as [Phase, { ms: number }][]) {
      (phases[phase] ??= []).push(timing.ms);
    }
  }
  return Object.fromEntries(
    Object.entries(phases).map(([phase, values]) => [phase, distribution(values)]),
  );
}

function memorySampler() {
  const baseline = process.memoryUsage();
  let peakRss = baseline.rss;
  let peakHeap = baseline.heapUsed;
  const sample = () => {
    const memory = process.memoryUsage();
    peakRss = Math.max(peakRss, memory.rss);
    peakHeap = Math.max(peakHeap, memory.heapUsed);
  };
  const interval = setInterval(sample, 10);
  return {
    stop() {
      clearInterval(interval);
    },
    finish() {
      sample();
      return {
        baselineRssBytes: baseline.rss,
        sampledPeakRssBytes: peakRss,
        sampledPeakHeapUsedBytes: peakHeap,
        processHighWaterRssBytes: process.resourceUsage().maxRSS * 1024,
      };
    },
  };
}

async function concurrent<T>(count: number, limit: number, work: (index: number) => Promise<T>) {
  const results: T[] = [];
  let next = 0;
  let failure: unknown;
  let failed = false;
  await Promise.all(
    Array.from({ length: Math.min(count, limit) }, async () => {
      while (!failed && next < count) {
        const index = next++;
        try {
          results[index] = await work(index);
          // Let the periodic sampler and mock deadlines run in disk-only workloads.
          if (index % 64 === 0) await setImmediate();
        } catch (error) {
          failed = true;
          failure = error;
        }
      }
    }),
  );
  if (failed) throw failure;
  return results;
}

interface Unit {
  attempts: { code: string; timing: AttemptTiming }[];
  recovery?: { fault: string; ms: number };
}

export async function runBenchmark(options: BenchmarkOptions) {
  const dir =
    options.database === 'disk' ? mkdtempSync(join(tmpdir(), 'receipt-benchmark-')) : undefined;
  const path = dir ? join(dir, 'benchmark.sqlite') : ':memory:';
  let close: (() => void) | undefined;
  try {
    const db = new Database(path);
    close = () => {
      db.close();
    };
    if (dir) db.pragma('journal_mode = WAL');
    const storage = sqliteStorage(db);
    await storage.migrate();
    const metrics = createInstrumentation();
    const injected = new AsyncLocalStorage<MockCase>();
    const lostCommit = new AsyncLocalStorage<boolean>();
    let activeProviders = 0;
    let peakProviders = 0;
    const provider = (id: ProviderId) => {
      const adapter = syntheticProvider(id, () => injected.getStore() ?? 'success', {
        delayMs: options.delayMs,
        now: () => epoch,
      });
      return metrics.provider({
        async retrieve(input, bounds) {
          activeProviders++;
          peakProviders = Math.max(peakProviders, activeProviders);
          try {
            return await adapter.retrieve(input, bounds);
          } finally {
            activeProviders--;
          }
        },
      });
    };
    const verifier = createReceiptVerifier({
      storage: metrics.storage({
        ...storage,
        async transaction(work) {
          const result = await storage.transaction(work);
          if (lostCommit.getStore()) throw new Error('Synthetic lost commit response');
          return result;
        },
      }),
      providers: { telebirr: provider('telebirr'), cbe: provider('cbe') },
      now: () => epoch,
    });
    await verifier.initialize();

    const providerFor = (index: number): ProviderId => {
      if (options.provider !== 'mixed') return options.provider;
      const group = options.workload === 'claims' ? Math.floor(index / 2) : index;
      return group % 2 ? 'cbe' : 'telebirr';
    };
    async function register(start: number, count: number) {
      for (let index = start; index < start + count; index++) {
        await verifier.registerExpectation(
          createPaymentExpectation({
            tenantId,
            paymentId: `test-${index}`,
            provider: providerFor(index),
            currency: 'ETB',
            amountMinor: parseEtbAmount(syntheticPayment.amount),
            recipientName: syntheticPayment.recipientName,
            recipientAccountLast4: syntheticPayment.recipientAccountLast4,
            reference: syntheticPayment.reference,
            validFrom: epoch - 60_000,
            validUntil: epoch + 60_000,
          }),
        );
      }
    }
    function attempt(index: number, scenario: MockCase, key: string, failCommit = false) {
      const evidenceIndex = options.workload === 'claims' ? Math.floor(index / 2) : index;
      const evidence = syntheticIdentifier(
        providerFor(index),
        `BENCH${String(evidenceIndex).padStart(8, '0')}`,
      );
      return metrics
        .attempt(async () => {
          try {
            await metrics.time('inputPreview', () => detectPaymentInput(evidence));
            const prepared = await metrics.time('prepare', () =>
              injected.run(scenario, () =>
                verifier.prepare(
                  {
                    tenantId,
                    paymentId: `test-${index}`,
                    idempotencyKey: `test-${index}-${key}`,
                    receiptLocator: evidence,
                  },
                  { timeoutMs: options.timeoutMs },
                ),
              ),
            );
            return (
              await metrics.time('complete', () =>
                lostCommit.run(failCommit, () => verifier.complete(prepared)),
              )
            ).code;
          } catch (error) {
            if (error instanceof VerificationOperationError) return error.code;
            throw error;
          }
        })
        .then(({ value, timing }) => ({ code: value, timing }));
    }
    async function unit(index: number): Promise<Unit> {
      if (options.workload === 'recovery') {
        const start = performance.now();
        if (index % 3 === 2) {
          const lost = await attempt(index, 'success', 'original', true);
          assert.equal(lost.code, 'STORAGE_OUTCOME_UNKNOWN');
          const recovered = await attempt(index, 'success', 'original');
          assert.equal(recovered.code, 'PAYMENT_VERIFIED');
          assert.equal(recovered.timing.phases.provider, undefined);
          return {
            attempts: [lost, recovered],
            recovery: { fault: lost.code, ms: performance.now() - start },
          };
        }
        const timeout = index % 3 === 0;
        const variant = timeout ? 'timeout' : 'network';
        const initial = await attempt(index, variant, 'original');
        assert.equal(initial.code, timeout ? 'PROVIDER_TIMEOUT' : 'PROVIDER_NETWORK_ERROR');
        const replay = await attempt(index, 'success', 'original');
        assert.equal(replay.code, initial.code);
        assert.equal(replay.timing.phases.provider, undefined);
        const retry = await attempt(index, 'success', 'retry');
        assert.equal(retry.code, 'PAYMENT_VERIFIED');
        assert.equal(retry.timing.phases.provider?.calls, 1);
        return {
          attempts: [initial, replay, retry],
          recovery: { fault: initial.code, ms: performance.now() - start },
        };
      }
      const mixed = [
        ['success', 'PAYMENT_VERIFIED'],
        ['amount', 'AMOUNT_UNDERPAID'],
        ['recipient', 'RECIPIENT_NAME_MISMATCH'],
        ['invoice', 'INVOICE_REFERENCE_MISMATCH'],
        ['missing', 'RECEIPT_NOT_FOUND'],
        ['network', 'PROVIDER_NETWORK_ERROR'],
      ] as const;
      const [variant, expected] =
        options.workload === 'mixed' ? mixed[index % mixed.length]! : mixed[0];
      const result = await attempt(index, variant, 'original');
      if (options.workload !== 'claims' || result.code !== 'RECEIPT_ALREADY_CLAIMED')
        assert.equal(result.code, expected);
      return { attempts: [result] };
    }

    // Use an even warmup count so the measured claim pairs never share warmup evidence.
    const warmup =
      options.workload === 'claims' ? options.warmup + (options.warmup % 2) : options.warmup;
    await register(0, warmup + options.requests);
    await concurrent(warmup, options.concurrency, unit);
    peakProviders = 0;
    const memory = memorySampler();
    const initialCpu = process.cpuUsage();
    const start = performance.now();
    try {
      const results = await concurrent(options.requests, options.concurrency, (index) =>
        unit(warmup + index),
      );
      const wallMs = performance.now() - start;
      const cpu = process.cpuUsage(initialCpu);
      const memoryUsage = memory.finish();
      const attempts = results.flatMap((result) => result.attempts);
      const recovery = results.flatMap((result) => (result.recovery ? [result.recovery] : []));
      const recoveryByFault: Record<string, number[]> = {};
      for (const item of recovery) (recoveryByFault[item.fault] ??= []).push(item.ms);
      const outcomes: Record<string, number> = {};
      for (const attempt of attempts) outcomes[attempt.code] = (outcomes[attempt.code] ?? 0) + 1;
      if (options.workload === 'claims') {
        for (let index = 0; index < results.length; index += 2) {
          const pair = results
            .slice(index, index + 2)
            .flatMap((result) => result.attempts.map(({ code }) => code))
            .sort();
          assert.deepEqual(pair, ['PAYMENT_VERIFIED', 'RECEIPT_ALREADY_CLAIMED']);
        }
      }
      const databaseBytes = dir
        ? [path, `${path}-wal`, `${path}-shm`].reduce(
            (sum, filename) => sum + (existsSync(filename) ? statSync(filename).size : 0),
            0,
          )
        : null;
      return {
        schemaVersion: 1,
        source: 'synthetic-only',
        options: { ...options, warmup },
        machine: {
          node: process.version,
          platform: process.platform,
          arch: process.arch,
          cpuModel: cpus()[0]?.model ?? null,
          availableParallelism: availableParallelism(),
          hostMemoryBytes: totalmem(),
          hostLogicalCpus: cpus().length,
          sqlite: (db.prepare('select sqlite_version() as version').get() as { version: string })
            .version,
        },
        wallMs,
        attempts: attempts.length,
        attemptsPerSecond: attempts.length / (wallMs / 1000),
        scenariosPerSecond: results.length / (wallMs / 1000),
        outcomes,
        rates: {
          providerTimeout: (outcomes.PROVIDER_TIMEOUT ?? 0) / attempts.length,
          providerUnavailable:
            ((outcomes.PROVIDER_TIMEOUT ?? 0) + (outcomes.PROVIDER_NETWORK_ERROR ?? 0)) /
            attempts.length,
          storageOutcomeUnknown: (outcomes.STORAGE_OUTCOME_UNKNOWN ?? 0) / attempts.length,
        },
        peakConcurrentProviders: peakProviders,
        latencyMs: distribution(attempts.map(({ timing }) => timing.totalMs)),
        phaseLatencyMs: phaseDistributions(attempts.map(({ timing }) => timing)),
        recoveryLatencyMs: distribution(recovery.map(({ ms }) => ms)),
        recoveryByFaultMs: Object.fromEntries(
          Object.entries(recoveryByFault).map(([fault, values]) => [fault, distribution(values)]),
        ),
        cpu: {
          userMs: cpu.user / 1000,
          systemMs: cpu.system / 1000,
          averageCores: (cpu.user + cpu.system) / 1000 / wallMs,
        },
        memory: memoryUsage,
        databaseBytes,
      };
    } finally {
      memory.stop();
    }
  } finally {
    close?.();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
}
