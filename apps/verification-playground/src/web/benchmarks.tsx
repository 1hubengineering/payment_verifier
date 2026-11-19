import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { runBenchmark } from '@1hubengineering/verification-benchmarks/suite';
import type { Api } from './api.ts';
import { ApiError } from './api.ts';
import {
  ControlButton,
  LoadingIcon,
  NativeSelect,
  TextInput,
} from '@1hubengineering/payment-web-ui';
import type { BenchmarkEnvironment } from '../server/benchmarks.ts';

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
  report: {
    environment: Omit<BenchmarkEnvironment, 'scratch'> & {
      kernel: string;
      system: string;
      cpuQuota: string | null;
      memoryLimitBytes: string | null;
      database: string;
      sdk: string;
    };
    measurement: Measurement;
  } | null;
}
interface Dashboard {
  history: Run[];
  monitor: { residentBytes: number | null; peakBytes: number | null } | null;
}

const mib = (bytes: number | null) =>
  bytes === null ? 'Unavailable' : `${(bytes / 1024 ** 2).toFixed(1)} MiB`;

const workloadNotes: Record<Workload, string> = {
  success: 'Each scenario uses a new matching receipt and completes its claim.',
  mixed: 'The workload mixes matches, mismatches, missing receipts and simulated network failures.',
  recovery:
    'The workload injects provider failures and lost commit responses. A scenario can make several verification attempts.',
  claims:
    'Each pair competes to claim the same receipt. The expected result is one claim and one rejection per pair.',
};

const ms = (value: number | undefined) =>
  value === undefined ? 'Unavailable' : `${value.toFixed(2)} ms`;
const rate = (value: number) => `${value.toFixed(1)} attempts/s`;
const percentage = (value: number) => `${(100 * value).toFixed(1)}%`;

function compareRuns(selected: Run | undefined, history: Run[] | undefined) {
  if (!selected?.report) return undefined;
  const { measurement, environment } = selected.report;
  // Browser probe timing has no bearing on the SQLite and mock provider run.
  const { chromiumProbe: _probe, ...conditions } = environment;
  return history?.find((run) => {
    if (run.id === selected.id || !run.report) return false;
    const { measurement: candidate, environment: other } = run.report;
    const { chromiumProbe: _otherProbe, ...otherConditions } = other;
    const { concurrency: _selectedConcurrency, ...selectedOptions } = measurement.options;
    const { concurrency: _candidateConcurrency, ...candidateOptions } = candidate.options;
    return (
      JSON.stringify(selectedOptions) === JSON.stringify(candidateOptions) &&
      JSON.stringify(conditions) === JSON.stringify(otherConditions) &&
      JSON.stringify(measurement.machine) === JSON.stringify(candidate.machine)
    );
  });
}

function RunMetrics({
  run,
  baseline,
}: {
  run: NonNullable<Run['report']>;
  baseline: Run | undefined;
}) {
  const { measurement } = run;
  const { latencyMs, options } = measurement;
  const metrics = [
    [
      'Throughput',
      rate(measurement.attemptsPerSecond),
      'Verification calls per second. Higher is better for equal work.',
    ],
    [
      'Scenario throughput',
      `${measurement.scenariosPerSecond.toFixed(1)} scenarios/s`,
      'Completed test cases per second. Includes any recovery attempts within each scenario.',
    ],
    [
      'Median latency (p50)',
      ms(latencyMs?.p50),
      'Half the attempts finished within this time. Lower is faster.',
    ],
    [
      'Tail latency (p95)',
      ms(latencyMs?.p95),
      '95% of attempts finished within this time. Lower is faster.',
    ],
    [
      'Tail latency (p99)',
      ms(latencyMs?.p99),
      '99% of attempts finished within this time. Lower is faster.',
    ],
    [
      'Process CPU',
      `${measurement.cpu.averageCores.toFixed(2)} cores`,
      'Average cores used while measuring. Lower uses less CPU for equal work.',
    ],
    [
      'Peak resident memory',
      mib(measurement.memory.processHighWaterRssBytes),
      'Process memory high-water mark, including initialization. Lower uses less memory for equal work.',
    ],
    [
      'Provider unavailable',
      percentage(measurement.rates.providerUnavailable),
      'Share of attempts with mock network errors or timeouts. Some workloads inject these failures.',
    ],
    [
      'Provider timeouts',
      percentage(measurement.rates.providerTimeout),
      'Share of attempts that exceeded the mock provider timeout. Part of the unavailable share.',
    ],
  ];
  const compared = baseline?.report?.measurement;
  return (
    <>
      <p>
        {workloadNotes[options.workload]} The harness checked the expected outcomes for this run.
      </p>
      <dl className="benchmark-metrics">
        {metrics.map(([name, value, description]) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd>{value}</dd>
            <small>{description}</small>
          </div>
        ))}
      </dl>
      {compared && baseline && (
        <>
          <h3>Comparable run</h3>
          <p className="muted">
            Same workload, sample size and recorded environment. Treat single-run differences as
            observations.
          </p>
          <div
            className="table-scroll"
            role="region"
            tabIndex={0}
            aria-label="Comparable benchmark runs"
          >
            <table className="ui-table">
              <thead>
                <tr>
                  <th scope="col">Run</th>
                  <th scope="col">Concurrency</th>
                  <th scope="col">Throughput</th>
                  <th scope="col">p95 latency</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Selected</th>
                  <td>{options.concurrency}</td>
                  <td>{rate(measurement.attemptsPerSecond)}</td>
                  <td>{ms(latencyMs?.p95)}</td>
                </tr>
                <tr>
                  <th scope="row">{new Date(baseline.startedAt).toLocaleString()}</th>
                  <td>{compared.options.concurrency}</td>
                  <td>{rate(compared.attemptsPerSecond)}</td>
                  <td>{ms(compared.latencyMs?.p95)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
      <details>
        <summary>Run conditions, outcome counts and raw JSON</summary>
        <p>
          {measurement.attempts} measured attempts across {options.requests} scenarios,{' '}
          {options.warmup} warm-up scenarios, {options.delayMs} ms mock provider delay,{' '}
          {options.timeoutMs} ms provider timeout, {ms(measurement.wallMs)} measured run time.
          Warm-up and expectation registration are outside the measured interval.
        </p>
        <p className="muted">
          Latency percentiles use nearest rank. Provider work is included in SDK prepare time, so
          phase timings overlap. Receipt HTML parsing, Chromium rendering and live network delays
          are outside the synthetic timings.
        </p>
        <pre tabIndex={0}>{JSON.stringify(run, null, 2)}</pre>
      </details>
    </>
  );
}

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
  const baseline = compareRuns(selected, data?.history);

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
          <h1>Verification benchmarks</h1>
          <p>
            Measure receipt processing, claims and recovery with a mock provider and disposable
            SQLite store.
          </p>
        </div>
      </div>
      <section className="panel benchmark-lead" aria-label="Benchmark takeaway">
        <h2>
          {measurement
            ? workloads[measurement.options.workload]
            : 'Compare the same workload under the same conditions'}
        </h2>
        {measurement ? (
          <p>
            Across {measurement.options.requests} scenarios and {measurement.attempts} verification
            attempts at concurrency {measurement.options.concurrency}, this run completed{' '}
            <strong>{rate(measurement.attemptsPerSecond)}</strong>.
            {measurement.latencyMs && (
              <>
                {' '}
                95% of attempts finished within <strong>{ms(measurement.latencyMs.p95)}</strong>.
              </>
            )}
          </p>
        ) : (
          <p>
            Hold the workload, scenario count and runtime environment steady when testing changes in
            concurrency. These runs measure SDK and SQLite work with synthetic input.
          </p>
        )}
      </section>
      <section className="panel">
        <h2>New benchmark</h2>
        <form
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <fieldset
            className="field-grid run-options"
            disabled={writing || Boolean(active) || !data}
          >
            <label>
              Workload{' '}
              <NativeSelect
                value={workload}
                onChange={(event) => setWorkload(event.target.value as Workload)}
              >
                {Object.entries(workloads).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label>
              Scenarios{' '}
              <TextInput
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
              Concurrent scenarios{' '}
              <TextInput
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
            <ControlButton variant="primary" disabled={writing || Boolean(active) || !data}>
              {active && <LoadingIcon />}
              {active ? 'Benchmark running…' : 'Run benchmark'}
            </ControlButton>
            {active && (
              <ControlButton
                type="button"
                disabled={writing}
                onClick={() => {
                  void cancel(active.id);
                }}
              >
                Cancel run
              </ControlButton>
            )}
          </div>
        </form>
        {active && (
          <p role="status">
            Running · Process resident memory {mib(data?.monitor?.residentBytes ?? null)} · Peak
            resident memory {mib(data?.monitor?.peakBytes ?? null)}
          </p>
        )}
        {message && (
          <p className="notice error" role="alert">
            {message}
          </p>
        )}
        <p className="muted">
          {workloadNotes[workload]} Each run starts with 10 warm-up scenarios and has a 30-second
          deadline.
        </p>
      </section>
      <section className="panel benchmark-settings">
        <h2>Benchmark history</h2>
        {data && data.history.length === 0 && <p>No benchmarks yet.</p>}
        {data && data.history.length > 0 && (
          <label>
            Report
            <NativeSelect
              value={selected?.id ?? ''}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {data.history.map((run) => (
                <option key={run.id} value={run.id}>
                  {new Date(run.startedAt).toLocaleString()} · {workloads[run.options.workload]} ·{' '}
                  {run.status}
                </option>
              ))}
            </NativeSelect>
          </label>
        )}
        {selected && (
          <p>
            {selected.options.requests} scenarios · Concurrency {selected.options.concurrency} ·{' '}
            {selected.status.replaceAll('_', ' ')}
          </p>
        )}
        {selected?.report && <RunMetrics run={selected.report} baseline={baseline} />}
      </section>
    </main>
  );
}
