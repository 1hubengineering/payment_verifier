import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vite-plus/test';
import { distribution, runBenchmark } from './suite.ts';
import type { BenchmarkOptions } from './suite.ts';

const options: BenchmarkOptions = {
  workload: 'success',
  concurrency: 4,
  requests: 12,
  warmup: 3,
  delayMs: 2,
  timeoutMs: 5,
  database: 'memory',
  provider: 'mixed',
};

describe('synthetic benchmark', () => {
  it('computes nearest-rank percentiles without changing the input samples', () => {
    const samples = [100, 1, 4, 5, 9];
    expect(distribution(samples)).toEqual({
      count: 5,
      min: 1,
      mean: 23.8,
      p50: 5,
      p95: 100,
      p99: 100,
      max: 100,
    });
    expect(samples).toEqual([100, 1, 4, 5, 9]);
    expect(distribution([])).toBeNull();
  });

  it('observes concurrent SDK requests and excludes warmup attempts', async () => {
    const result = await runBenchmark(options);
    expect(result).toMatchObject({
      source: 'synthetic-only',
      attempts: 12,
      peakConcurrentProviders: 4,
      outcomes: { PAYMENT_VERIFIED: 12 },
      latencyMs: { count: 12 },
      phaseLatencyMs: { provider: { count: 12 }, complete: { count: 12 } },
    });
    expect(result.attemptsPerSecond).toBeGreaterThan(0);
    expect(result.cpu.userMs + result.cpu.systemMs).toBeGreaterThan(0);
    expect(result.memory.sampledPeakRssBytes).toBeGreaterThan(0);
  });

  it('measures timeout, network and uncertain-commit recovery with validated SDK replays', async () => {
    const result = await runBenchmark({ ...options, workload: 'recovery' });
    expect(result.outcomes).toEqual({
      PAYMENT_VERIFIED: 12,
      PROVIDER_TIMEOUT: 8,
      PROVIDER_NETWORK_ERROR: 8,
      STORAGE_OUTCOME_UNKNOWN: 4,
    });
    expect(result.phaseLatencyMs.provider).toMatchObject({ count: 20 });
    expect(result.recoveryLatencyMs).toMatchObject({ count: 12 });
    expect(result.recoveryByFaultMs).toMatchObject({
      PROVIDER_TIMEOUT: { count: 4 },
      PROVIDER_NETWORK_ERROR: { count: 4 },
      STORAGE_OUTCOME_UNKNOWN: { count: 4 },
    });
  });

  it('measures claim contention with one SDK winner per pair in a temporary file-backed store', async () => {
    const result = await runBenchmark({ ...options, workload: 'claims', database: 'disk' });
    expect(result.options.warmup).toBe(4);
    expect(result.outcomes).toEqual({ PAYMENT_VERIFIED: 6, RECEIPT_ALREADY_CLAIMED: 6 });
    expect(result.databaseBytes).toBeGreaterThan(0);
  });

  it('rejects CLI destinations and live provider settings', () => {
    const result = spawnSync(
      process.execPath,
      [new URL('./main.ts', import.meta.url).pathname, '--provider', 'live'],
      { encoding: 'utf8' },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Invalid --provider');
    expect(result.stdout).toBe('');
  });
});
