import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { detectPaymentInput, PAYMENT_INPUT_LIMIT } from '@1hubengineering/verifier/input';
import type {
  Bounds,
  Draft,
  HistoryItem,
  InputProvider,
  Mode,
  Report,
  SavedDraft,
  SessionInfo,
  Submission,
} from '../contracts.ts';
import { defaultDraft, mockCases, syntheticIdentifier } from '../presets.ts';
import type { MockCase } from '../presets.ts';
import { ApiError, createApi } from './api.ts';
import type { Api } from './api.ts';
import { BenchmarkPanel } from './benchmarks.tsx';
import { DraftPanel } from './draft.tsx';
import { HistoryPanel, modeLabel, providerName, ReportDialog } from './report.tsx';
import {
  ControlButton,
  describeOutcome,
  LoadingIcon,
  NativeSelect,
  Textarea,
  TextInput,
} from '@1hubengineering/payment-web-ui';
import type { Outcome } from '@1hubengineering/payment-web-ui';
import './style.css';

const mockLabels: Record<MockCase, string> = {
  success: 'Successful receipt',
  amount: 'Amount mismatch',
  recipient: 'Recipient mismatch',
  invoice: 'Invoice mismatch',
  missing: 'Receipt not found',
  timeout: 'Timeout',
  network: 'Network failure',
};
const errorText = (error: unknown) =>
  error instanceof ApiError
    ? `${error.code} · ${error.message}`
    : 'Connection interrupted. Check attempt history before starting a new verification.';

function Playground({
  api,
  session,
  visible,
}: {
  api: Api;
  session: SessionInfo;
  visible: boolean;
}) {
  const [draft, setDraft] = useState(defaultDraft);
  const [drafts, setDrafts] = useState<SavedDraft[]>([]);
  const [draftId, setDraftId] = useState('');
  const [name, setName] = useState('');
  const [mode, setMode] = useState<Mode>('simulated');
  const [evidence, setEvidence] = useState('');
  const [inputProvider, setInputProvider] = useState<InputProvider>('auto');
  const [mockCase, setMockCase] = useState<MockCase>('success');
  const [showLiveValues, setShowLiveValues] = useState(false);
  const [scenario, setScenario] = useState<{ paymentId: string; bounds: Bounds }>();
  const [bounds, setBounds] = useState<Bounds>();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [failure, setFailure] = useState<Outcome>();
  const [verifying, setVerifying] = useState(false);
  const reportTrigger = useRef<HTMLElement | null>(null);
  const [report, setReport] = useState<Report>();
  const [comparison, setComparison] = useState<Report>();
  const [pending, setPending] = useState<Submission>();
  const [recovery, setRecovery] = useState<HistoryItem>();
  const [repeat, setRepeat] = useState<HistoryItem>();
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const busyGate = useRef(false);
  const evidenceField = useRef<HTMLTextAreaElement>(null);
  const waiting = useRef<AbortController | null>(null);
  const selected = drafts.find((value) => value.id === draftId);
  const detected = detectPaymentInput(evidence);
  const canLive = session.liveProviders.includes(draft.provider);
  const locked = busy || Boolean(pending);
  const runContext = recovery ?? repeat;

  useEffect(() => {
    let current = true;
    void Promise.all([api<SavedDraft[]>('drafts'), api<HistoryItem[]>('history')]).then(
      ([saved, records]) => {
        if (!current) return;
        setDrafts(saved);
        setHistory(records);
      },
      (cause: unknown) => {
        if (current) setError(errorText(cause));
      },
    );
    return () => {
      current = false;
    };
  }, [api]);

  async function latestHistory(recoverPending = false) {
    const items = await api<HistoryItem[]>('history');
    setHistory(items);
    const recovered =
      recoverPending && items.find((item) => item.attemptId === pending?.attemptId)?.report;
    if (recovered) {
      setReport(recovered);
      setFailure(undefined);
      setDialogOpen(true);
      setComparison(undefined);
      setPending(undefined);
      setRecovery(undefined);
      setRepeat(undefined);
    }
  }
  async function action(work: () => Promise<void>) {
    if (busyGate.current) return;
    busyGate.current = true;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await work();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      busyGate.current = false;
      setBusy(false);
    }
  }
  function editDraft(value: Draft) {
    setDraft(value);
    setScenario(undefined);
    setBounds(undefined);
  }
  function load(id: string) {
    const saved = drafts.find((value) => value.id === id);
    setDraftId(id);
    setName(saved?.name ?? '');
    if (saved) editDraft(saved.draft);
  }
  function save(update: boolean) {
    void action(async () => {
      const saved = await api<SavedDraft>(
        update ? `drafts/${draftId}` : 'drafts',
        update ? 'PUT' : 'POST',
        { name, draft },
      );
      setDrafts((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
      setDraftId(saved.id);
      setStatus('Draft saved.');
    });
  }
  async function register() {
    const result = await api<{ paymentId: string; bounds: Bounds }>('scenarios', 'POST', {
      draft,
      mode,
    });
    setScenario(result);
    setBounds(result.bounds);
    return result;
  }
  function newMode(value: Mode) {
    setMode(value);
    setEvidence('');
    setScenario(undefined);
    setRecovery(undefined);
    setRepeat(undefined);
    setInputProvider('auto');
    setMockCase('success');
    setShowLiveValues(false);
  }
  function open(item: HistoryItem, trigger: HTMLElement) {
    if (item.report) {
      reportTrigger.current = trigger;
      setDialogOpen(true);
      setFailure(undefined);
      setReport(item.report);
      setComparison(undefined);
      return;
    }
    setRecovery(item);
    setRepeat(undefined);
    setEvidence('');
    evidenceField.current?.focus();
  }
  function queueRepeat(item: HistoryItem) {
    setRepeat(item);
    setRecovery(undefined);
    setEvidence('');
    evidenceField.current?.focus();
  }
  async function verify(submission: Submission) {
    setPending(submission);
    const controller = new AbortController();
    waiting.current = controller;
    try {
      const value = await api<Report>('verify', 'POST', submission, controller.signal);
      setReport(value);
      setFailure(undefined);
      setDialogOpen(true);
      setComparison(undefined);
      if ('type' in value.result && value.result.code === 'STORAGE_OUTCOME_UNKNOWN') return;
      setPending(undefined);
      setRecovery(undefined);
      setRepeat(undefined);
      await latestHistory().catch((cause: unknown) => setError(errorText(cause)));
    } catch (cause) {
      if (controller.signal.aborted) {
        setFailure({
          title: 'Stopped waiting for verification',
          detail:
            'The server may still finish this attempt. Check history or recover the same attempt.',
          tone: 'warning',
        });
        setDialogOpen(true);
        return;
      }
      // A failed response can follow a committed claim. Keep the same submission available for recovery.
      if (cause instanceof ApiError && cause.status < 500 && cause.code !== 'ATTEMPT_IN_PROGRESS')
        setPending(undefined);
      throw cause;
    } finally {
      waiting.current = null;
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trigger = event.currentTarget.querySelector<HTMLButtonElement>('button[type="submit"]');
    void action(async () => {
      reportTrigger.current = trigger;
      setVerifying(true);
      try {
        if (pending) {
          await verify(pending);
          return;
        }
        const paymentId =
          runContext?.paymentId ?? scenario?.paymentId ?? (await register()).paymentId;
        await verify({
          paymentId,
          evidence,
          attemptId: recovery?.attemptId ?? crypto.randomUUID(),
          mode: runContext?.mode ?? mode,
          inputProvider: runContext?.inputProvider ?? inputProvider,
          mockCase: runContext?.mockCase ?? (mode === 'live' ? 'success' : mockCase),
          showLiveValues,
        });
      } catch (cause) {
        setFailure(
          describeOutcome('error', {
            message: cause instanceof ApiError ? cause.message : errorText(cause),
          }),
        );
        setDialogOpen(true);
      } finally {
        setVerifying(false);
      }
    });
  }

  return (
    <main className="wrap workspace">
      <div className="heading">
        <div>
          <p className="ui-label">Operator portal</p>
          <h1>Verification playground</h1>
          <p>
            Set an expected payment and inspect the receipt checks. Start with a simulated case or
            select live mode for an enabled provider.
          </p>
        </div>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {status && (
        <p className="notice" role="status">
          {status}
        </p>
      )}
      <div className="columns">
        <DraftPanel
          draft={draft}
          setDraft={editDraft}
          drafts={drafts}
          selected={selected}
          name={name}
          setName={setName}
          load={load}
          save={save}
          remove={() => {
            void action(async () => {
              await api(`drafts/${draftId}`, 'DELETE');
              setDrafts((values) => values.filter((value) => value.id !== draftId));
              setDraftId('');
              setName('');
              setStatus('Draft deleted.');
            });
          }}
          reset={() => {
            editDraft(defaultDraft());
            setDraftId('');
            setName('');
          }}
          register={(event) => {
            event.preventDefault();
            void action(async () => {
              await register();
              setStatus('Test payment created.');
            });
          }}
          preview={() => {
            void action(async () => {
              setBounds(await api<Bounds>('amount-preview', 'POST', draft));
            });
          }}
          paymentId={scenario?.paymentId}
          bounds={bounds}
          disabled={locked || Boolean(runContext)}
        />
        <section className="panel" aria-labelledby="submit-title">
          <div className="section-title">
            <h2 id="submit-title">Submit evidence</h2>
            <span className={`tag ${runContext?.mode ?? mode}`}>
              {modeLabel[runContext?.mode ?? mode]}
            </span>
          </div>
          <form onSubmit={submit} aria-busy={verifying}>
            <fieldset disabled={locked}>
              <div className="field-grid">
                <label>
                  Verification mode
                  <NativeSelect
                    value={runContext?.mode ?? mode}
                    disabled={Boolean(runContext)}
                    onChange={(event) =>
                      newMode(event.target.value === 'live' ? 'live' : 'simulated')
                    }
                  >
                    <option value="simulated">Simulated</option>
                    <option value="live" disabled={!session.liveProviders.length}>
                      Live
                    </option>
                  </NativeSelect>
                </label>
                <label>
                  Input provider
                  <NativeSelect
                    value={runContext?.inputProvider ?? inputProvider}
                    disabled={Boolean(runContext)}
                    onChange={(event) => {
                      const value = event.target.value;
                      setInputProvider(value === 'telebirr' || value === 'cbe' ? value : 'auto');
                    }}
                  >
                    <option value="auto">Auto detect</option>
                    <option value="telebirr">Telebirr</option>
                    <option value="cbe">CBE</option>
                  </NativeSelect>
                </label>
              </div>
              {(runContext?.mode ?? mode) === 'simulated' && (
                <label>
                  Mock outcome
                  <NativeSelect
                    disabled={Boolean(runContext)}
                    value={runContext?.mockCase ?? mockCase}
                    onChange={(event) => {
                      setMockCase(
                        mockCases.find((value) => value === event.target.value) ?? 'success',
                      );
                    }}
                  >
                    {mockCases.map((value) => (
                      <option key={value} value={value}>
                        {mockLabels[value]}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
              )}
              {(runContext?.mode ?? mode) === 'live' && (
                <label className="checkbox">
                  <TextInput
                    type="checkbox"
                    checked={showLiveValues}
                    onChange={(event) => setShowLiveValues(event.target.checked)}
                  />
                  Reveal recipient and invoice values for this response
                </label>
              )}
              <label>
                Transaction ID, receipt URL or SMS
                <Textarea
                  ref={evidenceField}
                  value={evidence}
                  onChange={(event) => setEvidence(event.target.value)}
                  maxLength={PAYMENT_INPUT_LIMIT}
                  rows={5}
                  placeholder="Paste payment evidence"
                  spellCheck={false}
                />
              </label>
              <div className="input-preview" aria-live="polite">
                {evidence.length === 0 ? (
                  <span className="muted">Awaiting evidence</span>
                ) : detected.ok ? (
                  <>
                    <strong>Input parsed</strong>
                    <span>
                      {providerName[detected.value.provider]} ·{' '}
                      {detected.value.inputType.replaceAll('_', ' ')}
                    </span>
                    <code>
                      {(runContext?.mode ?? mode) === 'simulated'
                        ? detected.value.identifier
                        : `••••${detected.value.identifier.slice(-4)}`}
                    </code>
                  </>
                ) : (
                  <>
                    <strong>{detected.error.code}</strong>
                    <span>{detected.error.message}</span>
                  </>
                )}
              </div>
            </fieldset>
            {!runContext && mode === 'live' && !canLive && (
              <p className="notice error">
                Live verification is disabled for {providerName[draft.provider]}.
              </p>
            )}
            {mode === 'simulated' && !runContext && !pending && (
              <div className="actions samples">
                <ControlButton
                  type="button"
                  onClick={() =>
                    setEvidence(syntheticIdentifier(draft.provider, crypto.randomUUID()))
                  }
                  disabled={busy}
                >
                  Use synthetic ID
                </ControlButton>
                <ControlButton type="button" onClick={() => setEvidence('v2-')} disabled={busy}>
                  Invalid ID
                </ControlButton>
                <ControlButton
                  type="button"
                  onClick={() =>
                    setEvidence('ID v2-Conflict and https://mbreciept.cbe.com.et/v2-Synthetic_42')
                  }
                  disabled={busy}
                >
                  Ambiguous input
                </ControlButton>
                <ControlButton
                  type="button"
                  onClick={() =>
                    setEvidence(
                      syntheticIdentifier(
                        draft.provider === 'cbe' ? 'telebirr' : 'cbe',
                        crypto.randomUUID(),
                      ),
                    )
                  }
                  disabled={busy}
                >
                  Provider conflict
                </ControlButton>
              </div>
            )}
            {runContext && (
              <p className="notice">
                {recovery
                  ? 'Paste the original evidence to recover this attempt with the same ID.'
                  : 'Paste evidence to make a fresh attempt against this existing test payment.'}
              </p>
            )}
            {pending && (
              <p className="notice">
                Recover this request with its original attempt ID. History can show a result
                committed while the response was interrupted.
              </p>
            )}
            <div className="actions submit">
              <ControlButton
                variant="primary"
                type="submit"
                disabled={busy || (!pending && !runContext && mode === 'live' && !canLive)}
              >
                {verifying && <LoadingIcon />}
                {verifying
                  ? 'Checking receipt…'
                  : pending || recovery
                    ? 'Recover attempt'
                    : repeat
                      ? 'Run again'
                      : 'Verify payment'}
              </ControlButton>
              {busy && pending && (
                <ControlButton type="button" onClick={() => waiting.current?.abort()}>
                  Stop waiting
                </ControlButton>
              )}
              {runContext && !pending && (
                <ControlButton
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setRecovery(undefined);
                    setRepeat(undefined);
                  }}
                >
                  Back to current draft
                </ControlButton>
              )}
            </div>
          </form>
          <p className="sr-only" role="status">
            {verifying ? 'Checking receipt…' : ''}
          </p>
        </section>
      </div>
      <ReportDialog
        key={report?.attemptId}
        report={visible && dialogOpen && !failure ? report : undefined}
        comparison={comparison}
        failure={visible && dialogOpen ? failure : undefined}
        onClose={() => {
          setDialogOpen(false);
          if (report?.transientChecks) {
            const { transientChecks: _transientChecks, ...saved } = report;
            setReport(saved);
          }
        }}
        restoreFocus={() => reportTrigger.current?.focus()}
      />
      <HistoryPanel
        history={history}
        report={report}
        retain={session.retentionDays}
        open={open}
        compare={(compared, trigger) => {
          reportTrigger.current = trigger;
          setComparison(compared);
          setFailure(undefined);
          setDialogOpen(true);
        }}
        repeat={queueRepeat}
        disabled={locked}
        refreshing={busy}
        refresh={() => {
          void action(async () => {
            reportTrigger.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
            await latestHistory(true);
          });
        }}
      />
    </main>
  );
}

function App() {
  const [session, setSession] = useState<SessionInfo>();
  const [api] = useState(() => createApi(() => setSession(undefined)));
  const [section, setSection] = useState<'verification' | 'benchmark' | 'password'>('verification');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void api<SessionInfo>('session', 'GET', undefined, controller.signal)
      .then(setSession, (cause: unknown) => {
        if (!controller.signal.aborted && (!(cause instanceof ApiError) || cause.status !== 401))
          setError(errorText(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setReady(true);
      });
    return () => controller.abort();
  }, [api]);

  async function submit(event: FormEvent<HTMLFormElement>, changing: boolean) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setLoading(true);
    setError('');
    try {
      if (changing && values.get('password') !== values.get('confirmation')) {
        setError('The new passwords must match.');
        return;
      }
      await api(
        changing ? 'auth/password' : 'auth/login',
        'POST',
        changing
          ? { current: values.get('current'), password: values.get('password') }
          : { username: values.get('username'), password: values.get('password') },
      );
      form.reset();
      setSession(await api<SessionInfo>('session'));
      setSection('verification');
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    setLoading(true);
    setError('');
    try {
      await api('auth/logout', 'POST');
      setSession(undefined);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) setSession(undefined);
      else setError(errorText(cause));
    } finally {
      setLoading(false);
    }
  }

  const changing = Boolean(session && (session.mustChangePassword || section === 'password'));
  if (!ready)
    return (
      <main className="login wrap">
        <p role="status">Loading portal…</p>
      </main>
    );
  const brand = (
    <span className="brand">
      <span className="brand-mark" aria-hidden="true">
        ✓
      </span>
      Payment Verifier
    </span>
  );
  return (
    <>
      {session && (
        <header className="portal-header">
          {/* Adapted from Shadcnblocks Application Shell 4. */}
          <div className="wrap topbar">
            {brand}
            <nav className="portal-nav" aria-label="Administrator tools">
              {!session.mustChangePassword && (
                <>
                  <ControlButton
                    type="button"
                    aria-current={section === 'verification' ? 'page' : undefined}
                    onClick={() => setSection('verification')}
                  >
                    Live Verification
                  </ControlButton>
                  <ControlButton
                    type="button"
                    aria-current={section === 'benchmark' ? 'page' : undefined}
                    onClick={() => setSection('benchmark')}
                  >
                    Benchmarking
                  </ControlButton>
                  <ControlButton
                    type="button"
                    aria-current={section === 'password' ? 'page' : undefined}
                    onClick={() => setSection('password')}
                  >
                    Change password
                  </ControlButton>
                </>
              )}
            </nav>
            <ControlButton
              type="button"
              variant="ghost"
              onClick={() => {
                void signOut();
              }}
              disabled={loading}
            >
              Sign out
            </ControlButton>
          </div>
        </header>
      )}
      {error && (
        <p className="wrap notice error" role="alert">
          {error}
        </p>
      )}
      {!session || changing ? (
        <main className="login wrap">
          {/* Adapted from Shadcnblocks Login 1. */}
          {!session && brand}
          <div className="login-card panel">
            <h1>{changing ? 'Change administrator password' : 'Sign in to the operator portal'}</h1>
            {session?.mustChangePassword && (
              <p>Change the initial password to unlock verification and benchmarking.</p>
            )}
            <form
              key={changing ? 'change' : 'login'}
              onSubmit={(event) => {
                void submit(event, changing);
              }}
            >
              {changing ? (
                <label>
                  Current password
                  <TextInput
                    name="current"
                    type="password"
                    required
                    autoComplete="current-password"
                    maxLength={256}
                  />
                </label>
              ) : (
                <label>
                  Administrator name
                  <TextInput name="username" required autoComplete="username" maxLength={128} />
                </label>
              )}
              <label>
                {changing ? 'New password' : 'Password'}
                <TextInput
                  name="password"
                  type="password"
                  required
                  minLength={changing ? 16 : undefined}
                  maxLength={256}
                  autoComplete={changing ? 'new-password' : 'current-password'}
                />
              </label>
              {changing && (
                <label>
                  Confirm new password
                  <TextInput
                    name="confirmation"
                    type="password"
                    required
                    minLength={16}
                    maxLength={256}
                    autoComplete="new-password"
                  />
                </label>
              )}
              <ControlButton variant="primary" disabled={loading}>
                {loading ? 'Working…' : changing ? 'Save password' : 'Sign in'}
              </ControlButton>
            </form>
          </div>
        </main>
      ) : (
        <>
          <div hidden={section !== 'verification'}>
            <Playground api={api} session={session} visible={section === 'verification'} />
          </div>
          {section === 'benchmark' && <BenchmarkPanel api={api} />}
        </>
      )}
    </>
  );
}

const container = document.getElementById('root');
if (!container) throw new Error('Playground root is missing');
createRoot(container).render(<App />);
