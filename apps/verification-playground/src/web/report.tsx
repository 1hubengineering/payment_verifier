import { useState } from 'react';
import {
  checkRows,
  ControlButton,
  describeOutcome,
  VerificationDialog,
  VerificationHistory,
} from '@1hubengineering/payment-web-ui';
import type { Outcome } from '@1hubengineering/payment-web-ui';
import type { Phase } from '@1hubengineering/verification-benchmarks/performance';
import type { HistoryItem, Mode, Report } from '../contracts.ts';

export const providerName = { telebirr: 'Telebirr', cbe: 'CBE' } as const;
export const modeLabel: Record<Mode, string> = { live: 'Live', simulated: 'Simulated' };
export function elapsed(ms: number): string {
  return `${ms.toFixed(2)} ms`;
}

function reportOutcome(report: Report): Outcome {
  const { result } = report;
  return describeOutcome('status' in result ? result.status : 'error', {
    simulated: report.mode === 'simulated',
    code: result.code,
    message:
      report.mode === 'simulated'
        ? result.message.replaceAll(/official receipt/giu, 'synthetic receipt')
        : result.message,
  });
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
      <div
        className="table-scroll"
        tabIndex={0}
        role="region"
        aria-label="Performance measurements"
      >
        <table className="ui-table">
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

export function ReportDialog({
  report,
  comparison,
  failure,
  onClose,
  restoreFocus,
}: {
  report: Report | undefined;
  comparison: Report | undefined;
  failure: Outcome | undefined;
  onClose: () => void;
  restoreFocus: () => void;
}) {
  const [feedback, setFeedback] = useState('');
  const result = report?.result;
  const observed = result && 'checks' in result ? result : undefined;
  const compared =
    comparison && 'checks' in comparison.result ? comparison.result.checks : undefined;
  const json =
    report &&
    JSON.stringify(
      { mode: report.mode, result, timing: report.timing, timeoutMs: report.timeoutMs },
      null,
      2,
    );
  return (
    <VerificationDialog
      outcome={failure ?? (report && reportOutcome(report))}
      checks={checkRows(observed?.checks ?? [], report?.transientChecks, compared)}
      context={
        report
          ? `${modeLabel[report.mode]} · ${providerName[report.provider]}`
          : 'Verification attempt'
      }
      onClose={onClose}
      restoreFocus={restoreFocus}
    >
      {report && result && (
        <>
          {result.details.transportCode === 'TELEBIRR_TUNNEL_OFFLINE' && (
            <p>Start the SSH tunnel from a computer on Ethio telecom, then select Run again.</p>
          )}
          {observed?.status === 'VERIFIED' && report.mode === 'live' && (
            <p>Receipt verification leaves settlement and fulfillment with the host.</p>
          )}
          <dl className="facts">
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
          </dl>
          {comparison && (
            <p className="summary-line">
              Compared with{' '}
              <strong>
                {modeLabel[comparison.mode]} · {reportOutcome(comparison).title}
              </strong>
              {' · '}
              {elapsed(comparison.timing.totalMs)}
              {' · '}
              {new Date(comparison.startedAt).toLocaleString()}
            </p>
          )}
          <PerformanceDetails report={report} comparison={comparison} />
          <details>
            <summary>Developer diagnostics and JSON</summary>
            <dl className="facts">
              <div>
                <dt>Code</dt>
                <dd>
                  <code>{result.code}</code>
                </dd>
              </div>
              <div>
                <dt>Stage</dt>
                <dd>{result.stage}</dd>
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
                Saved results and JSON redact receipt identifiers, recipient names and invoice
                references.
              </p>
            )}
            <ControlButton
              type="button"
              onClick={() => {
                void (async () => {
                  try {
                    await navigator.clipboard.writeText(json ?? '');
                    setFeedback('JSON copied.');
                  } catch {
                    setFeedback('Clipboard unavailable. Select the JSON to copy it.');
                  }
                })();
              }}
            >
              Copy JSON
            </ControlButton>
            <span className="muted copy-feedback" role="status">
              {feedback}
            </span>
            <pre tabIndex={0}>{json}</pre>
          </details>
        </>
      )}
    </VerificationDialog>
  );
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
}: {
  history: HistoryItem[];
  report: Report | undefined;
  retain: number;
  open: (item: HistoryItem, trigger: HTMLElement) => void;
  compare: (report: Report, trigger: HTMLElement) => void;
  repeat: (item: HistoryItem) => void;
  disabled: boolean;
  refresh: () => void;
  refreshing: boolean;
}) {
  return (
    <VerificationHistory
      detail={`Latest 100 attempts, retained for ${retain} days. Select a row to review its saved result.`}
      showDuration
      headerAction={
        <ControlButton type="button" onClick={refresh} disabled={refreshing}>
          Refresh
        </ControlButton>
      }
      entries={history.map((item) => ({
        id: item.attemptId,
        time: new Date(item.startedAt).toLocaleString(),
        context: `${modeLabel[item.mode]} · ${providerName[item.provider]}`,
        outcome: item.report ? reportOutcome(item.report) : undefined,
        disabled: disabled && !item.report,
        duration: item.report ? elapsed(item.report.timing.totalMs) : undefined,
        actions: item.report && (
          <>
            <ControlButton type="button" onClick={() => repeat(item)} disabled={disabled}>
              Run again
            </ControlButton>
            <ControlButton
              type="button"
              onClick={(event) => {
                if (item.report) compare(item.report, event.currentTarget);
              }}
              disabled={disabled || !report || report.attemptId === item.attemptId}
            >
              Compare
            </ControlButton>
          </>
        ),
      }))}
      onOpen={(id, trigger) => {
        const item = history.find((entry) => entry.attemptId === id);
        if (item && (item.report || !disabled)) open(item, trigger);
      }}
    />
  );
}
