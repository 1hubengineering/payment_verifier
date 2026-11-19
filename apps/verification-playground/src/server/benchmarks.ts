import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, readFileSync } from 'node:fs';
import { release, version } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from 'better-sqlite3';
import { z } from 'zod';
import { RequestError } from './request-error.ts';

const workloads = ['success', 'mixed', 'recovery', 'claims'] as const;
export const benchmarkOptions = z.strictObject({
  workload: z.enum(workloads),
  requests: z.number().int().min(2).max(600).multipleOf(2),
  concurrency: z.number().int().min(1).max(4),
});

export interface BenchmarkEnvironment {
  source: string;
  docker: string;
  storage: string;
  chromium: string;
  chromiumProbe?: {
    startupMs: number;
    renderingMs: number;
    memoryBaselineBytes: number | null;
    memoryWithBrowserBytes: number | null;
  };
  scratch: string;
}

const deadlineMs = 30_000;
const directoryPrefix = 'andhub-controlled-benchmark-';
type EndStatus = 'completed' | 'failed' | 'cancelled' | 'timed_out' | 'interrupted';
interface Running {
  id: string;
  child: ChildProcess;
  finished: Promise<void>;
  stop: (status: EndStatus) => void;
}

function cgroup(name: string) {
  try {
    return readFileSync(`/sys/fs/cgroup/${name}`, 'utf8').trim();
  } catch {
    return null;
  }
}

export function createBenchmarks(
  db: Database,
  environment: BenchmarkEnvironment,
  now: () => number,
) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS portal_benchmarks (
      id TEXT PRIMARY KEY, status TEXT NOT NULL, started_at INTEGER NOT NULL,
      finished_at INTEGER, options TEXT NOT NULL, report TEXT
    );
    UPDATE portal_benchmarks SET status='interrupted', finished_at=started_at WHERE status='running';
  `);
  let running: Running | undefined;
  const { scratch, ...deployment } = environment;
  mkdirSync(scratch, { recursive: true, mode: 0o700 });
  for (const name of readdirSync(scratch)) {
    if (name.startsWith(directoryPrefix))
      rmSync(join(scratch, name), { recursive: true, force: true });
  }

  function list() {
    const rows = db
      .prepare('SELECT * FROM portal_benchmarks ORDER BY rowid DESC LIMIT 20')
      .all() as {
      id: string;
      status: EndStatus | 'running';
      started_at: number;
      finished_at: number | null;
      options: string;
      report: string | null;
    }[];
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      startedAt: new Date(row.started_at).toISOString(),
      finishedAt: row.finished_at === null ? null : new Date(row.finished_at).toISOString(),
      options: JSON.parse(row.options) as z.infer<typeof benchmarkOptions>,
      report: row.report === null ? null : (JSON.parse(row.report) as unknown),
    }));
  }

  function start(options: z.infer<typeof benchmarkOptions>) {
    if (running)
      throw new RequestError(409, 'BENCHMARK_BUSY', 'Wait for the current benchmark to finish.');
    const id = randomUUID();
    const dir = mkdtempSync(join(scratch, directoryPrefix));
    try {
      db.transaction(() => {
        db.prepare('INSERT INTO portal_benchmarks VALUES (?, ?, ?, NULL, ?, NULL)').run(
          id,
          'running',
          now(),
          JSON.stringify(options),
        );
        db.exec(`DELETE FROM portal_benchmarks WHERE rowid IN
          (SELECT rowid FROM portal_benchmarks ORDER BY rowid DESC LIMIT -1 OFFSET 20)`);
      })();
    } catch (error) {
      rmSync(dir, { recursive: true, force: true });
      throw error;
    }
    const child = spawn(
      process.execPath,
      [
        '--max-old-space-size=128',
        fileURLToPath(import.meta.resolve('@1hubengineering/verification-benchmarks/cli')),
        '--workload',
        options.workload,
        '--requests',
        String(options.requests),
        '--concurrency',
        String(options.concurrency),
        '--warmup',
        '10',
        '--delay-ms',
        '3',
        '--timeout-ms',
        '50',
        '--database',
        'disk',
        '--provider',
        'mixed',
      ],
      { env: { TMPDIR: dir, LANG: 'C.UTF-8', TZ: 'UTC' }, stdio: ['ignore', 'pipe', 'ignore'] },
    );
    let forced: EndStatus | undefined;
    let output = '';
    let succeeded = false;
    function stop(status: EndStatus) {
      forced ??= status;
      child.kill('SIGKILL');
    }
    const deadline = setTimeout(() => stop('timed_out'), deadlineMs);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      output += chunk;
      if (output.length > 64_000) stop('failed');
    });
    child.once('error', () => {
      forced ??= 'failed';
    });
    child.once('exit', (code) => {
      succeeded = code === 0;
    });
    const finished = new Promise<void>((resolve) => {
      child.once('close', () => {
        try {
          let report: string | null = null;
          if (!forced && succeeded) {
            const rows: unknown = JSON.parse(output);
            if (!Array.isArray(rows) || rows.length !== 1)
              throw new Error('Invalid benchmark result');
            report = JSON.stringify({
              environment: {
                ...deployment,
                kernel: release(),
                system: version(),
                cpuQuota: cgroup('cpu.max'),
                memoryLimitBytes: cgroup('memory.max'),
                database: 'SQLite via better-sqlite3 / direct SQL adapter',
                sdk: '0.2.0',
              },
              measurement: rows[0] as unknown,
            });
          }
          db.prepare(
            'UPDATE portal_benchmarks SET status=?, finished_at=?, report=? WHERE id=?',
          ).run(forced ?? (report ? 'completed' : 'failed'), now(), report, id);
        } catch {
          try {
            db.prepare('UPDATE portal_benchmarks SET status=?, finished_at=? WHERE id=?').run(
              'failed',
              now(),
              id,
            );
          } catch {
            process.stderr.write(
              'Could not save benchmark status. Recovery will reconcile the run on restart.\n',
            );
          }
        } finally {
          clearTimeout(deadline);
          try {
            rmSync(dir, { recursive: true, force: true });
          } catch {
            process.stderr.write('Benchmark scratch cleanup will retry on restart.\n');
          } finally {
            running = undefined;
            resolve();
          }
        }
      });
    });
    running = { id, child, stop, finished };
    return { id };
  }

  return {
    list,
    start,
    active: () => Boolean(running),
    monitor() {
      const pid = running?.child.pid;
      if (!pid || process.platform !== 'linux') return null;
      try {
        const row = readFileSync(`/proc/${pid}/status`, 'utf8');
        const rss = /^VmRSS:\s+(\d+) kB$/mu.exec(row)?.[1];
        const highWater = /^VmHWM:\s+(\d+) kB$/mu.exec(row)?.[1];
        return {
          residentBytes: rss ? Number(rss) * 1024 : null,
          peakBytes: highWater ? Number(highWater) * 1024 : null,
        };
      } catch {
        return null;
      }
    },
    cancel(id: string) {
      if (!running || running.id !== id)
        throw new RequestError(409, 'BENCHMARK_NOT_RUNNING', 'This benchmark has already ended.');
      running.stop('cancelled');
    },
    async close() {
      const current = running;
      current?.stop('interrupted');
      await current?.finished;
    },
  };
}
