import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { runBenchmark } from '@1hubengineering/verification-benchmarks/suite';
import type { Api } from './api.ts';
import { ApiError } from './api.ts';

const workloads = {
  success: 'Successful receipts',
  mixed: 'Mixed verification outcomes',
  recovery: 'Timeout and commit recovery',
  claims: 'Duplicate claim contention',
};
type Workload = keyof typeof workloads;
type Measurement = Awaited<ReturnType<typeof runBenchmark>>;
interface Run {
  id: string;
  status: string;
  startedAt: string;
  options: { workload: Workload; requests: number; concurrency: number };
  report: { environment: unknown; measurement: Measurement } | null;
}
interface Dashboard {
  history: Run[];
  monitor: { residentBytes: number | null; peakBytes: number | null } | null;
}

const mib = (bytes: number | null) =>
  bytes === null ? 'Unavailable' : `${(bytes / 1024 ** 2).toFixed(1)} MiB`;

export function BenchmarkPanel({ api }: { api: Api }) {
  const [data, setData] = useState<Dashboard>();
  const [workload, setWorkload] = useState<Workload>('success');
  const [requests, setRequests] = useState('60');
  const [concurrency, setConcurrency] = useState('1');
  const [selectedId, setSelectedId] = useState<string>();
  const [message, setMessage] = useState('');
  const [writing, setWriting] = useState(false);
  const active = data?.history.find((run) => run.status === 'running');
  const selected = data?.history.find((run) => run.id === selectedId) ?? data?.history[0];
  const measurement = selected?.report?.measurement;
  const latency = measurement?.latencyMs;

  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function refresh() {
      if (pending) return;
      pending = true;
      try {
        setData(await api<Dashboard>('benchmarks', 'GET', undefined, controller.signal));
      } catch {
        if (!controller.signal.aborted) setMessage('Could not refresh benchmark history.');
      } finally {
        pending = false;
      }
    }
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 1000);
    return () => {
      window.clearInterval(timer);
      controller.abort();
    };
  }, [api]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setWriting(true);
    setMessage('');
    try {
      const { id } = await api<{ id: string }>('benchmarks', 'POST', {
        workload,
        requests: Number(requests),
        concurrency: Number(concurrency),
      });
      setSelectedId(id);
      setData(await api<Dashboard>('benchmarks'));
    } catch (cause) {
      setMessage(
        cause instanceof ApiError
          ? cause.message
          : 'Could not start the benchmark. Check history before retrying.',
      );
    } finally {
      setWriting(false);
    }
  }

  async function cancel(id: string) {
    setWriting(true);
    setMessage('');
    try {
      await api(`benchmarks/${id}/cancel`, 'POST');
      setData(await api<Dashboard>('benchmarks'));
    } catch (cause) {
      setMessage(cause instanceof ApiError ? cause.message : 'Could not cancel the benchmark.');
    } finally {
      setWriting(false);
    }
  }

  return (
    <main className="wrap workspace">
      <div className="heading">
        <div>
          <h1>Benchmarking</h1>
          <p>Run the SDK against synthetic receipts and a disposable SQLite store.</p>
        </div>
      </div>
      <section className="panel">
        <h2>New benchmark</h2>
        <form
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <fieldset className="field-grid" disabled={writing || Boolean(active) || !data}>
            <label>
              Workload{' '}
              <select
                value={workload}
                onChange={(event) => setWorkload(event.target.value as Workload)}
              >
                {Object.entries(workloads).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Scenarios{' '}
              <input
                type="number"
                min="2"
                max="600"
                step="2"
                value={requests}
                onChange={(event) => setRequests(event.target.value)}
                required
              />
            </label>
            <label>
              Concurrency{' '}
              <input
                type="number"
                min="1"
                max="4"
                value={concurrency}
                onChange={(event) => setConcurrency(event.target.value)}
                required
              />
            </label>
          </fieldset>
          <div className="actions">
            <button className="primary" disabled={writing || Boolean(active) || !data}>
              Run benchmark
            </button>
            {active && (
              <button
                type="button"
                disabled={writing}
                onClick={() => {
                  void cancel(active.id);
                }}
              >
                Cancel run
              </button>
            )}
          </div>
        </form>
        {active && (
          <p role="status">
            Running · Process memory {mib(data?.monitor?.residentBytes ?? null)} · Peak{' '}
            {mib(data?.monitor?.peakBytes ?? null)}
          </p>
        )}
        {message && (
          <p className="notice error" role="alert">
            {message}
          </p>
        )}
        <p className="muted">
          One run at a time. Each run starts with 10 warm-up scenarios and has a 30-second deadline.
        </p>
      </section>
      <section className="panel benchmark-history">
        <h2>Benchmark history</h2>
        {data && data.history.length === 0 && <p>No benchmarks yet.</p>}
        {data && data.history.length > 0 && (
          <label>
            Report
            <select
              value={selected?.id ?? ''}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {data.history.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.startedAt} · {workloads[run.options.workload]} · {run.status}
                </option>
              ))}
            </select>
          </label>
        )}
        {selected && (
          <p>
            {selected.options.requests} scenarios · Concurrency {selected.options.concurrency} ·{' '}
            {selected.status.replaceAll('_', ' ')}
          </p>
        )}
        {measurement && (
          <dl className="benchmark-metrics">
            <div>
              <dt>Attempts</dt>
              <dd>{measurement.attempts}</dd>
            </div>
            <div>
              <dt>Attempts/s</dt>
              <dd>{measurement.attemptsPerSecond.toFixed(1)}</dd>
            </div>
            <div>
              <dt>p50 / p95 / p99</dt>
              <dd>
                {latency
                  ? [latency.p50, latency.p95, latency.p99].map((ms) => ms.toFixed(2)).join(' / ') +
                    ' ms'
                  : 'Unavailable'}
              </dd>
            </div>
            <div>
              <dt>Process CPU</dt>
              <dd>{(100 * measurement.cpu.averageCores).toFixed(1)}% of one core</dd>
            </div>
            <div>
              <dt>Peak RSS</dt>
              <dd>{mib(measurement.memory.processHighWaterRssBytes)}</dd>
            </div>
            <div>
              <dt>Provider unavailable</dt>
              <dd>{(100 * measurement.rates.providerUnavailable).toFixed(1)}%</dd>
            </div>
            <div>
              <dt>Provider timeouts</dt>
              <dd>{(100 * measurement.rates.providerTimeout).toFixed(1)}%</dd>
            </div>
          </dl>
        )}
        {selected?.report && (
          <>
            <p className="muted">
              Adapter and prepare timings overlap. The synthetic workload uses a mock provider
              adapter, so receipt HTML parsing and Chromium rendering are outside these latency
              figures.
            </p>
            <details>
              <summary>Environment, phase timings, and JSON report</summary>
              <pre>{JSON.stringify(selected.report, null, 2)}</pre>
            </details>
          </>
        )}
      </section>
    </main>
  );
}
