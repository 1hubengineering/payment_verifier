import { useState } from 'react';
import type { JsonValue, VerificationCheck } from '@1hubengineering/verifier';
import type { Phase } from '@1hubengineering/verification-benchmarks/performance';
import type { HistoryItem, Mode, Report } from '../contracts.ts';
import { amount } from './draft.tsx';

const fields: Record<VerificationCheck['field'], string> = {
  provider: 'Provider',
  transactionId: 'Transaction ID',
  paymentStatus: 'Transaction status',
  amountMinor: 'Transferred amount',
  currency: 'Currency',
  recipientName: 'Recipient name',
  recipientAccount: 'Account last four',
  invoiceReference: 'Invoice reference',
  transactionTime: 'Transaction time',
  paymentType: 'Payment type',
};

export const providerName = { telebirr: 'Telebirr', cbe: 'CBE' } as const;
export const modeLabel: Record<Mode, string> = { live: 'LIVE', simulated: 'SIMULATED' };
export function elapsed(ms: number): string {
  return `${ms.toFixed(2)} ms`;
}

function cell(check: VerificationCheck, value: JsonValue | undefined): string {
  if (value === null || value === undefined) return '—';
  if (check.field === 'amountMinor' && typeof value === 'number') return amount(value);
  if (check.field === 'recipientAccount' && typeof value === 'string') return `•••• ${value}`;
  if (check.field === 'transactionTime' && typeof value === 'number')
    return new Date(value).toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

const phaseLabels: Record<Phase, string> = {
  inputPreview: 'Input preview parsing',
  prepare: 'SDK prepare',
  provider: 'Provider adapter',
  complete: 'SDK completion',
  storageRead: 'SDK storage reads',
  storageTransaction: 'SDK storage transactions',
};

function PerformanceDetails({
  report,
  comparison,
}: {
  report: Report;
  comparison: Report | undefined;
}) {
  return (
    <details>
      <summary>Performance diagnostics</summary>
      <p className="muted">
        SDK prepare includes provider work and reads. Completion includes checks and storage. These
        durations overlap.
      </p>
      {report.timeoutMs !== undefined && (
        <p>
          Provider timeout budget <strong>{report.timeoutMs.toLocaleString()} ms</strong>
        </p>
      )}
      <div className="table-scroll" tabIndex={0} aria-label="Performance measurements">
        <table>
          <thead>
            <tr>
              <th scope="col">Phase</th>
              <th scope="col">Duration</th>
              <th scope="col">Calls</th>
              {comparison && <th scope="col">Compared duration</th>}
            </tr>
          </thead>
          <tbody>
            {(Object.keys(phaseLabels) as Phase[]).map((phase) => {
              const timing = report.timing.phases[phase];
              const previous = comparison?.timing.phases[phase];
              return (
                <tr key={phase}>
                  <th scope="row">{phaseLabels[phase]}</th>
                  <td>{timing ? elapsed(timing.ms) : '—'}</td>
                  <td>{timing?.calls ?? '—'}</td>
                  {comparison && <td>{previous ? elapsed(previous.ms) : '—'}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted">
        Provider timing covers the adapter as a whole, including CBE browser work when applicable. A
        dash means the phase was skipped or the measurement is unavailable.
      </p>
    </details>
  );
}

export function ReportPanel({
  report,
  comparison,
}: {
  report: Report | undefined;
  comparison: Report | undefined;
}) {
  const [feedback, setFeedback] = useState('');
  if (!report)
    return (
      <section className="panel empty">
        <h2>Verification report</h2>
        <p>Run a verification or open an attempt from history.</p>
      </section>
    );
  const { result } = report;
  const observed = 'status' in result ? result : undefined;
  const json = JSON.stringify(
    { mode: report.mode, result, timing: report.timing, timeoutMs: report.timeoutMs },
    null,
    2,
  );
  const valueFor = (check: VerificationCheck, field: 'expected' | 'actual') =>
    cell(
      check,
      report.transientChecks?.find((item) => item.field === check.field)?.[field] ?? check[field],
    );
  const tone =
    observed?.status === 'VERIFIED'
      ? 'positive'
      : observed?.status === 'UNAVAILABLE'
        ? 'warning'
        : 'negative';
  return (
    <section className="panel" aria-labelledby="report-title">
      <div className="section-title">
        <h2 id="report-title">Verification report</h2>
        <span className={`tag ${report.mode}`}>{modeLabel[report.mode]}</span>
      </div>
      <div className="result-line">
        <strong className={tone}>{observed?.status ?? 'Operation error'}</strong>
        <code>{result.code}</code>
      </div>
      <p>
        {report.mode === 'simulated'
          ? result.message.replaceAll(/official receipt/giu, 'synthetic receipt')
          : result.message}
      </p>
      {result.details.transportCode === 'TELEBIRR_TUNNEL_OFFLINE' && (
        <p>Start the SSH tunnel from a computer on Ethio telecom, then select Run again.</p>
      )}
      <dl className="facts">
        <div>
          <dt>Provider</dt>
          <dd>{providerName[report.provider]}</dd>
        </div>
        <div>
          <dt>Started</dt>
          <dd>{new Date(report.startedAt).toLocaleString()}</dd>
        </div>
        <div>
          <dt>Duration</dt>
          <dd>{elapsed(report.timing.totalMs)}</dd>
        </div>
        <div>
          <dt>Retryable</dt>
          <dd>{result.retryable ? 'Yes' : 'No'}</dd>
        </div>
        <div>
          <dt>Payment ID</dt>
          <dd>
            <code>{report.paymentId}</code>
          </dd>
        </div>
        <div>
          <dt>Verification ID</dt>
          <dd>
            <code>{observed?.verificationId ?? '—'}</code>
          </dd>
        </div>
      </dl>
      {comparison && (
        <p className="summary-line">
          Compared with{' '}
          <strong>
            {modeLabel[comparison.mode]} · {comparison.result.code}
          </strong>{' '}
          · {elapsed(comparison.timing.totalMs)} · {new Date(comparison.startedAt).toLocaleString()}
        </p>
      )}
      {observed && observed.checks.length > 0 && (
        <div className="table-scroll" tabIndex={0} aria-label="Verification checks">
          <table>
            <caption>
              Expected vs. {report.mode === 'live' ? 'official receipt' : 'synthetic receipt'}
            </caption>
            <thead>
              <tr>
                <th scope="col">Field / rule</th>
                <th scope="col">Expected</th>
                <th scope="col">Actual</th>
                <th scope="col">Check</th>
                {comparison && <th scope="col">Compared check</th>}
              </tr>
            </thead>
            <tbody>
              {observed.checks.map((check) => (
                <tr key={check.field}>
                  <th scope="row">
                    {fields[check.field]}
                    <small>{check.rule}</small>
                  </th>
                  <td>{valueFor(check, 'expected')}</td>
                  <td>
                    {valueFor(check, 'actual')}
                    {check.field === 'amountMinor' && check.details.differenceMinor !== null && (
                      <small>
                        Difference {check.details.differenceMinor > 0 ? '+' : ''}
                        {amount(check.details.differenceMinor)}
                      </small>
                    )}
                  </td>
                  <td
                    className={
                      check.status === 'PASS'
                        ? 'positive'
                        : check.status === 'SKIPPED'
                          ? 'muted'
                          : 'negative'
                    }
                  >
                    {check.status}
                    {check.code && <small>{check.code}</small>}
                  </td>
                  {comparison && (
                    <td>
                      {'checks' in comparison.result
                        ? (comparison.result.checks.find((value) => value.field === check.field)
                            ?.status ?? '—')
                        : '—'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <PerformanceDetails report={report} comparison={comparison} />
      <details>
        <summary>Developer diagnostics and JSON</summary>
        <dl className="facts">
          <div>
            <dt>Stage</dt>
            <dd>{result.stage}</dd>
          </div>
          {observed?.source && (
            <>
              <div>
                <dt>Parser version</dt>
                <dd>{observed.source.parserVersion}</dd>
              </div>
              <div>
                <dt>Retrieved at</dt>
                <dd>{observed.source.retrievedAt}</dd>
              </div>
              <div>
                <dt>Content hash</dt>
                <dd>
                  <code>{observed.source.contentHash}</code>
                </dd>
              </div>
            </>
          )}
          {Object.entries(result.details).map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{JSON.stringify(value)}</dd>
            </div>
          ))}
        </dl>
        {report.mode === 'live' && (
          <p className="muted">
            Report JSON redacts receipt identifiers, recipient names and invoice references.
          </p>
        )}
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(json).then(
              () => setFeedback('JSON copied.'),
              () => setFeedback('Clipboard unavailable. Select the JSON to copy it.'),
            );
          }}
        >
          Copy JSON
        </button>
        <span className="muted copy-feedback" role="status">
          {feedback}
        </span>
        <pre>{json}</pre>
      </details>
    </section>
  );
}

interface HistoryProps {
  history: HistoryItem[];
  report: Report | undefined;
  retain: number;
  open: (item: HistoryItem) => void;
  compare: (report: Report) => void;
  repeat: (item: HistoryItem) => void;
  disabled: boolean;
  refresh: () => void;
  refreshing: boolean;
}
export function HistoryPanel({
  history,
  report,
  retain,
  open,
  compare,
  repeat,
  disabled,
  refresh,
  refreshing,
}: HistoryProps) {
  return (
    <section className="panel" aria-labelledby="history-title">
      <div className="section-title">
        <h2 id="history-title">Attempt history</h2>
        <button type="button" onClick={refresh} disabled={refreshing}>
          Refresh
        </button>
      </div>
      <p className="muted">Latest 100 attempts, retained for {retain} days.</p>
      {history.length === 0 ? (
        <p className="muted">No attempts recorded.</p>
      ) : (
        <div className="table-scroll" tabIndex={0} aria-label="Attempt history">
          <table>
            <thead>
              <tr>
                <th scope="col">Started / payment ID</th>
                <th scope="col">Mode / provider</th>
                <th scope="col">Outcome</th>
                <th scope="col">Duration</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {history.map((item) => (
                <tr key={item.attemptId}>
                  <td>
                    {new Date(item.startedAt).toLocaleString()}
                    <small>
                      <code>{item.paymentId}</code>
                    </small>
                  </td>
                  <td>
                    <span className={`tag ${item.mode}`}>{modeLabel[item.mode]}</span>
                    <small>{providerName[item.provider]}</small>
                  </td>
                  <td>
                    {item.report
                      ? 'status' in item.report.result
                        ? item.report.result.status
                        : 'Operation error'
                      : 'Outcome pending'}
                    {item.report && <small>{item.report.result.code}</small>}
                  </td>
                  <td>{item.report ? elapsed(item.report.timing.totalMs) : '—'}</td>
                  <td>
                    <div className="actions tight">
                      <button onClick={() => open(item)} disabled={disabled}>
                        {item.report ? 'Open' : 'Recover'}
                      </button>
                      {item.report && (
                        <>
                          <button onClick={() => repeat(item)} disabled={disabled}>
                            Run again
                          </button>
                          <button
                            onClick={() => {
                              if (item.report) compare(item.report);
                            }}
                            disabled={disabled || !report || report.attemptId === item.attemptId}
                          >
                            Compare
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
