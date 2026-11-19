import { parseArgs } from 'node:util';
import { runBenchmark, workloads } from './suite.ts';
import type { BenchmarkOptions, Workload } from './suite.ts';

const help = `Synthetic SDK verification benchmark
  --workload all|success|mixed|recovery|claims (default all)
  --concurrency 1,4,16                        (default 1,4,16)
  --requests N                                (default 600 scenarios per row)
  --warmup N                                  (default 30 scenarios)
  --delay-ms N                                (default 3)
  --timeout-ms N                              (default 20)
  --provider mixed|telebirr|cbe                (default mixed)
  --database disk|memory                      (default disk)
  --help
Outputs a JSON array. Claims require an even request count. Only synthetic inputs are supported.`;

function integer(value: string | undefined, min: number, max: number, name: string): number {
  const number = Number(value);
  if (
    !value ||
    !/^\d+$/u.test(value) ||
    !Number.isSafeInteger(number) ||
    number < min ||
    number > max
  )
    throw new Error(`--${name} must be an integer from ${min} to ${max}`);
  return number;
}

try {
  const { values } = parseArgs({
    options: {
      help: { type: 'boolean' },
      workload: { type: 'string', default: 'all' },
      concurrency: { type: 'string', default: '1,4,16' },
      requests: { type: 'string', default: '600' },
      warmup: { type: 'string', default: '30' },
      'delay-ms': { type: 'string', default: '3' },
      'timeout-ms': { type: 'string', default: '20' },
      provider: { type: 'string', default: 'mixed' },
      database: { type: 'string', default: 'disk' },
    },
  });
  if (values.help) console.log(help);
  else {
    const workload = values.workload;
    if (workload !== 'all' && !workloads.some((value) => value === workload))
      throw new Error('Invalid --workload');
    const selected: readonly Workload[] = workload === 'all' ? workloads : [workload as Workload];
    const { provider, database } = values;
    if (provider !== 'mixed' && provider !== 'telebirr' && provider !== 'cbe')
      throw new Error('Invalid --provider');
    if (database !== 'disk' && database !== 'memory') throw new Error('Invalid --database');
    const delayMs = integer(values['delay-ms'], 0, 1000, 'delay-ms');
    const timeoutMs = integer(values['timeout-ms'], delayMs + 1, 2000, 'timeout-ms');
    const requests = integer(values.requests, 1, 20_000, 'requests');
    if (selected.includes('claims') && requests % 2)
      throw new Error('Claims require an even --requests value');
    const warmup = integer(values.warmup, 0, 1000, 'warmup');
    const concurrencies = new Set(
      values.concurrency.split(',').map((value) => integer(value, 1, 64, 'concurrency')),
    );
    const matrix: Awaited<ReturnType<typeof runBenchmark>>[] = [];
    for (const current of selected) {
      for (const concurrency of concurrencies) {
        const options: BenchmarkOptions = {
          workload: current,
          concurrency,
          requests,
          warmup,
          delayMs,
          timeoutMs,
          provider,
          database,
        };
        matrix.push(await runBenchmark(options));
      }
    }
    console.log(JSON.stringify(matrix, null, 2));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Benchmark failed');
  process.exitCode = 1;
}
