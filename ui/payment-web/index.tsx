import * as Dialog from '@radix-ui/react-dialog';
import { useRef, useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import type { JsonValue, VerificationCheck } from '@1hubengineering/verifier';

export function ControlButton({
  variant,
  className,
  ...props
}: ComponentProps<'button'> & {
  variant?: 'primary' | 'ghost';
}) {
  return (
    <button
      className={className ? `ui-button ${className}` : 'ui-button'}
      data-variant={variant}
      {...props}
    />
  );
}

// These shadcn form slots retain browser-native labels, validation and keyboard behavior.
export function TextInput(props: ComponentProps<'input'>) {
  return <input data-slot="input" {...props} />;
}
export function NativeSelect(props: ComponentProps<'select'>) {
  return <select data-slot="native-select" {...props} />;
}
export function Textarea(props: ComponentProps<'textarea'>) {
  return <textarea data-slot="textarea" {...props} />;
}
export function LoadingIcon() {
  return <span className="ui-loading" aria-hidden="true" />;
}

type Tone = 'success' | 'danger' | 'warning' | 'neutral';
type CheckRow = {
  label: string;
  status: VerificationCheck['status'];
  expected?: string | undefined;
  observed?: string | undefined;
  note?: string | undefined;
  compared?: VerificationCheck['status'] | undefined;
};

export function OutcomeBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className="ui-pill" data-tone={tone}>
      {children}
    </span>
  );
}

export interface Outcome {
  title: string;
  detail: string;
  tone: Tone;
}

export function describeOutcome(
  status: string,
  options: {
    simulated?: boolean | undefined;
    code?: string | undefined;
    message?: string | undefined;
  } = {},
): Outcome {
  const { code, simulated, message } = options;
  if (code === 'RECEIPT_ALREADY_CLAIMED' || status === 'RECEIPT_ALREADY_CLAIMED')
    return {
      title: 'Receipt already submitted',
      detail: 'This receipt has already been claimed.',
      tone: 'danger',
    };
  if (code === 'IDEMPOTENCY_CONFLICT')
    return {
      title: 'Attempt already used',
      detail: 'This attempt was previously bound to different payment evidence.',
      tone: 'danger',
    };
  if (code === 'STORAGE_OUTCOME_UNKNOWN')
    return {
      title: 'Verification outcome is unknown',
      detail:
        'The stored result could not be confirmed. Check history or recover the same attempt before starting a new one.',
      tone: 'warning',
    };
  switch (status) {
    case 'VERIFIED':
      return simulated
        ? {
            title: 'Simulated verification',
            detail: 'The sample passed the checks against a simulated provider record.',
            tone: 'success',
          }
        : {
            title: 'Payment verified',
            detail: 'The official receipt matches this order.',
            tone: 'success',
          };
    case 'MISMATCH':
      return {
        title: 'Receipt details did not match',
        detail: message ?? 'One or more receipt details differ from the expected payment.',
        tone: 'danger',
      };
    case 'NOT_FOUND':
      return {
        title: 'Receipt not found',
        detail: message ?? 'Check the confirmation from your payment provider.',
        tone: 'danger',
      };
    case 'INVALID_INPUT':
      return {
        title: 'Receipt input not accepted',
        detail: message ?? 'Check your receipt number, link, or message.',
        tone: 'danger',
      };
    case 'UNAVAILABLE':
      return {
        title: 'Receipt could not be checked',
        detail:
          message ??
          (code === 'PROVIDER_TIMEOUT'
            ? 'The provider took too long to return a receipt.'
            : code === 'UNSUPPORTED_RECEIPT_FORMAT'
              ? 'The verifier could not read the receipt format.'
              : 'The provider could not supply enough reliable information.'),
        tone: 'warning',
      };
    default:
      return {
        title: 'Could not submit the receipt',
        detail: message ?? 'Retry this submission or contact the merchant.',
        tone: 'warning',
      };
  }
}

const fields: Record<VerificationCheck['field'], string> = {
  provider: 'Provider',
  transactionId: 'Transaction ID',
  paymentStatus: 'Transaction status',
  amountMinor: 'Transferred amount',
  currency: 'Currency',
  recipientName: 'Recipient name',
  recipientAccount: 'Account ending',
  invoiceReference: 'Invoice reference',
  transactionTime: 'Transaction time',
  paymentType: 'Payment type',
};

const money = new Intl.NumberFormat('en-ET');
function etb(minor: number) {
  const value = BigInt(minor);
  const whole = money.format(value / 100n);
  return `ETB ${whole}.${String(value % 100n).padStart(2, '0')}`;
}
const date = (value: number) =>
  new Date(value).toISOString().replace('T', ' ').replace('.000Z', ' UTC');

function checkValue(
  field: VerificationCheck['field'],
  value: JsonValue | undefined,
): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (field === 'amountMinor' && typeof value === 'number') return etb(value);
  if (field === 'provider' && typeof value === 'string') {
    return value === 'cbe' ? 'CBE' : value === 'telebirr' ? 'Telebirr' : value;
  }
  if (value === '[redacted]') return 'Hidden in saved reports';
  if (field === 'recipientAccount' && typeof value === 'string' && /^\d{4}$/u.test(value))
    return `•••• ${value}`;
  if (field === 'transactionTime') {
    if (typeof value === 'number') return date(value);
    if (
      typeof value === 'object' &&
      'from' in value &&
      'until' in value &&
      typeof value.from === 'number' &&
      typeof value.until === 'number'
    )
      return `${date(value.from)} to ${date(value.until)}`;
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export function checkRows(
  checks: readonly VerificationCheck[],
  reveal?: readonly VerificationCheck[],
  comparison?: readonly VerificationCheck[],
): CheckRow[] {
  return checks.map((check) => {
    const transient = reveal?.find((row) => row.field === check.field);
    const expected = checkValue(check.field, transient?.expected ?? check.expected);
    const note =
      check.field === 'amountMinor' && check.rule === 'within_tolerance'
        ? `Accepted range ${etb(check.details.minimumAcceptedMinor)} to ${etb(check.details.maximumAcceptedMinor)}`
        : undefined;
    return {
      label: fields[check.field],
      status: check.status,
      expected,
      observed: checkValue(check.field, transient?.actual ?? check.actual),
      note,
      compared: comparison?.find((row) => row.field === check.field)?.status,
    };
  });
}

const findings: Record<CheckRow['status'], { label: string; tone: Tone }> = {
  PASS: { label: 'Matched', tone: 'success' },
  FAIL: { label: 'Did not match', tone: 'danger' },
  MISSING: { label: 'Missing from receipt', tone: 'warning' },
  INVALID: { label: 'Unreadable value', tone: 'warning' },
  AMBIGUOUS: { label: 'Ambiguous value', tone: 'warning' },
  SKIPPED: { label: 'Not required', tone: 'neutral' },
};

export function VerificationDialog({
  outcome,
  context,
  checks = [],
  children,
  onClose,
  restoreFocus,
}: {
  outcome?: Outcome | undefined;
  context: string;
  checks?: readonly CheckRow[] | undefined;
  children?: ReactNode;
  onClose: () => void;
  restoreFocus: () => void;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  const matched = checks.filter((check) => check.status === 'PASS').length;
  const failed = checks.filter((check) => check.status === 'FAIL').length;
  const skipped = checks.filter((check) => check.status === 'SKIPPED').length;
  const unresolved = checks.length - matched - failed - skipped;
  const hasComparison = checks.some((row) => row.compared);
  const ordered = checks.filter((check) => check.status === 'FAIL');
  ordered.push(
    ...checks.filter(
      (check) => check.status !== 'FAIL' && check.status !== 'PASS' && check.status !== 'SKIPPED',
    ),
    ...checks.filter((check) => check.status === 'PASS' || check.status === 'SKIPPED'),
  );
  return (
    <Dialog.Root
      open={Boolean(outcome)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {outcome && (
        <Dialog.Portal>
          {/* The CSS overlay locks scrolling without injecting styles under the page CSP. */}
          <div className="ui-dialog-overlay" aria-hidden="true" />
          <Dialog.Content
            className="ui-dialog"
            aria-modal="true"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              title.current?.focus();
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              restoreFocus();
            }}
          >
            <header className="ui-dialog-head">
              <div className="ui-dialog-headbar">
                <OutcomeBadge tone={outcome.tone}>{context}</OutcomeBadge>
                <Dialog.Close asChild>
                  <ControlButton type="button" variant="ghost">
                    Close
                  </ControlButton>
                </Dialog.Close>
              </div>
              <Dialog.Title ref={title} tabIndex={-1}>
                {outcome.title}
              </Dialog.Title>
              <Dialog.Description>{outcome.detail}</Dialog.Description>
            </header>
            <section aria-label="Receipt checks">
              <h3>Receipt checks</h3>
              {checks.length === 0 ? (
                <p>No individual checks were available for this attempt.</p>
              ) : (
                <>
                  <ul className="ui-check-counts">
                    <li>
                      <OutcomeBadge tone="success">{matched} matched</OutcomeBadge>
                    </li>
                    <li>
                      <OutcomeBadge tone="danger">{failed} failed</OutcomeBadge>
                    </li>
                    <li>
                      <OutcomeBadge tone="warning">
                        {unresolved} could not be evaluated
                      </OutcomeBadge>
                    </li>
                    {skipped > 0 && (
                      <li>
                        <OutcomeBadge tone="neutral">{skipped} not required</OutcomeBadge>
                      </li>
                    )}
                  </ul>
                  <div
                    className="ui-table-scroll"
                    tabIndex={0}
                    role="region"
                    aria-label="Expected and observed receipt values"
                  >
                    <table className="ui-table ui-check-table">
                      <thead>
                        <tr>
                          <th scope="col">Check</th>
                          <th scope="col">Expected</th>
                          <th scope="col">Observed</th>
                          <th scope="col">Finding</th>
                          {hasComparison && <th scope="col">Compared finding</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {ordered.map(({ label, expected, observed, status, note, compared }) => (
                          <tr key={label}>
                            <th scope="row">
                              {label}
                              {note && <small>{note}</small>}
                            </th>
                            <td>{expected ?? '—'}</td>
                            <td>{observed ?? '—'}</td>
                            <td>
                              <OutcomeBadge tone={findings[status].tone}>
                                {findings[status].label}
                              </OutcomeBadge>
                            </td>
                            {hasComparison && <td>{compared ? findings[compared].label : '—'}</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>
            {children}
          </Dialog.Content>
        </Dialog.Portal>
      )}
    </Dialog.Root>
  );
}

export interface HistoryEntry {
  id: string | number;
  time: string;
  context: string;
  outcome?: Outcome | undefined;
  duration?: string | undefined;
  actions?: ReactNode;
  disabled?: boolean;
}

export function VerificationHistory({
  entries,
  detail,
  onOpen,
  headerAction,
  showDuration,
}: {
  entries: readonly HistoryEntry[];
  detail: string;
  onOpen: (id: HistoryEntry['id'], trigger: HTMLElement) => void;
  headerAction?: ReactNode;
  showDuration?: boolean;
}) {
  return (
    <section className="ui-history" aria-label="Verification history">
      <div className="ui-history-header">
        <h2>Verification history</h2>
        {headerAction}
      </div>
      <p>{detail}</p>
      {entries.length ? (
        <div
          className="ui-table-scroll"
          role="region"
          tabIndex={0}
          aria-label="Verification attempts"
        >
          <table className="ui-table">
            <thead>
              <tr>
                <th scope="col">Started</th>
                <th scope="col">Context</th>
                <th scope="col">Outcome</th>
                {showDuration && <th scope="col">Duration</th>}
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.id}
                  data-open-row={entry.disabled ? undefined : ''}
                  onClick={(event) => {
                    if (entry.disabled) return;
                    if (event.target instanceof Element && event.target.closest('button')) return;
                    const button = event.currentTarget.querySelector('button');
                    if (button) onOpen(entry.id, button);
                  }}
                >
                  <td>{entry.time}</td>
                  <td>{entry.context}</td>
                  <td>
                    {entry.outcome ? (
                      <OutcomeBadge tone={entry.outcome.tone}>{entry.outcome.title}</OutcomeBadge>
                    ) : (
                      <OutcomeBadge tone="warning">Outcome pending</OutcomeBadge>
                    )}
                  </td>
                  {showDuration && <td>{entry.duration ?? '—'}</td>}
                  <td>
                    <div className="ui-history-actions">
                      <ControlButton
                        type="button"
                        disabled={entry.disabled}
                        onClick={(event) => onOpen(entry.id, event.currentTarget)}
                      >
                        {entry.outcome ? 'View result' : 'Recover attempt'}
                        <span className="sr-only">
                          {' '}
                          for {entry.context}, {entry.time}
                        </span>
                      </ControlButton>
                      {entry.actions}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>No verification attempts yet.</p>
      )}
    </section>
  );
}

export function useVerificationHistory<T>() {
  const [history, setHistory] = useState<{ id: number; value: T; context: string; time: string }[]>(
    [],
  );
  const [selected, setSelected] = useState<T>();
  const nextId = useRef(0);
  const trigger = useRef<HTMLElement | null>(null);
  return {
    history,
    selected,
    save(value: T, context: string, source: HTMLElement | null) {
      trigger.current = source;
      const entry = { id: nextId.current++, value, context, time: new Date().toLocaleString() };
      setHistory((entries) => [entry, ...entries].slice(0, 100));
      setSelected(value);
    },
    open: (id: HistoryEntry['id'], source: HTMLElement) => {
      trigger.current = source;
      setSelected(history.find((entry) => entry.id === id)?.value);
    },
    close: () => setSelected(undefined),
    restoreFocus: () => trigger.current?.focus(),
  };
}
