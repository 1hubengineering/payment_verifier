import { useState } from 'react';
import type { FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { Hash, Link2, MessageSquareText } from 'lucide-react';
import { detectPaymentInput, PAYMENT_INPUT_LIMIT } from '@1hubengineering/verifier/input';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  createSimulation,
  evidenceTypes,
  sampleDraft,
  sampleEvidence,
  scenarios,
} from './synthetic-scenarios';
import type { Draft, EvidenceType, Scenario } from './synthetic-scenarios';
import {
  checkRows,
  describeOutcome,
  LoadingIcon,
  NativeSelect,
  Textarea,
  useVerificationHistory,
  VerificationDialog,
  VerificationHistory,
} from '@1hubengineering/payment-web-ui';
import type { Outcome } from '@1hubengineering/payment-web-ui';
import { waitForDemo } from './demo-wait';

const icons = { 'Transaction ID': Hash, 'Receipt URL': Link2, SMS: MessageSquareText };
const labels = {
  amount: 'Expected amount (ETB)',
  reference: 'Invoice reference',
  recipient: 'Recipient name',
  account: 'Recipient account (last four)',
  from: 'Valid from (UTC)',
  until: 'Valid until (UTC)',
} as const;

function Playground() {
  const [draft, setDraft] = useState(() => sampleDraft('telebirr', 'success'));
  const [scenario, setScenario] = useState<Scenario>('success');
  const [kind, setKind] = useState<EvidenceType>('Transaction ID');
  const [evidence, setEvidence] = useState(() =>
    sampleEvidence('telebirr', 'Transaction ID', 'success'),
  );
  const [busy, setBusy] = useState(false);
  const attempts = useVerificationHistory<{
    result?: ReturnType<ReturnType<typeof createSimulation>['run']>;
    outcome: Outcome;
    context: string;
  }>();
  const parsed = detectPaymentInput(evidence);
  function reset(provider: Draft['provider'], next: Scenario) {
    setScenario(next);
    setDraft(sampleDraft(provider, next));
    setEvidence(sampleEvidence(provider, kind, next));
  }
  function edit<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const submit = event.currentTarget.querySelector<HTMLButtonElement>('button[type="submit"]');
    const context = `Simulated · ${draft.provider === 'cbe' ? 'CBE' : 'Telebirr'} · ${scenarios[scenario]}`;
    setBusy(true);
    try {
      await waitForDemo(new AbortController().signal);
      const simulation = createSimulation();
      let result;
      if (scenario === 'duplicate' || scenario === 'conflict') {
        const initial = simulation.run(draft, evidence, 'success', 'seed-payment', 'seed-key');
        if (initial.status !== 'VERIFIED') result = initial;
      }
      result ??=
        scenario === 'conflict'
          ? simulation.run(draft, 'v2-', 'success', 'seed-payment', 'seed-key')
          : simulation.run(draft, evidence, scenario, 'demo-payment', 'demo-key');
      attempts.save(
        {
          result,
          context,
          outcome: describeOutcome(result.status, {
            simulated: true,
            code: result.code,
            message:
              result.code === 'PROVIDER_MISMATCH'
                ? 'The receipt belongs to a different provider than the expected payment.'
                : undefined,
          }),
        },
        context,
        submit,
      );
    } catch {
      attempts.save(
        {
          context,
          outcome: describeOutcome('INVALID_INPUT', {
            message:
              'Check the expected amount, tolerance, invoice reference, account ending and UTC validity window.',
          }),
        },
        context,
        submit,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-heading">
        <h1>Synthetic playground</h1>
        <p>
          Choose a scenario and compare a sample receipt against an expected payment. The simulation
          runs entirely in your browser.
        </p>
      </div>
      <form
        onSubmit={(event) => {
          void verify(event);
        }}
        aria-busy={busy}
      >
        <fieldset className="simulation-grid" disabled={busy}>
          <section className="simulation-panel" aria-labelledby="expected-payment">
            <h2 id="expected-payment">Expected payment</h2>
            <FieldGroup className="simulation-fields">
              <Field>
                <FieldLabel htmlFor="simulation-provider">Provider</FieldLabel>
                <NativeSelect
                  id="simulation-provider"
                  value={draft.provider}
                  onChange={(event) =>
                    reset(event.target.value === 'cbe' ? 'cbe' : 'telebirr', scenario)
                  }
                >
                  <option value="telebirr">Telebirr</option>
                  <option value="cbe">CBE</option>
                </NativeSelect>
              </Field>
              {Object.entries(labels).map(([key, label]) => {
                const field = key as keyof typeof labels;
                return (
                  <Field key={key}>
                    <FieldLabel htmlFor={key}>{label}</FieldLabel>
                    <Input
                      id={key}
                      type={field === 'from' || field === 'until' ? 'datetime-local' : 'text'}
                      value={draft[field]}
                      onChange={(event) => edit(field, event.target.value)}
                      required
                      maxLength={field === 'account' ? 4 : 120}
                    />
                  </Field>
                );
              })}
              <Field>
                <FieldLabel htmlFor="simulation-policy">Amount policy</FieldLabel>
                <NativeSelect
                  id="simulation-policy"
                  value={draft.policy}
                  onChange={(event) => edit('policy', event.target.value)}
                >
                  <option value="exact">Exact amount</option>
                  <option value="tolerance">With tolerance</option>
                </NativeSelect>
              </Field>
              {draft.policy === 'tolerance' &&
                (['under', 'over'] as const).map((side) => (
                  <Field key={side}>
                    <FieldLabel htmlFor={side}>
                      {side === 'under' ? 'Maximum underpayment' : 'Maximum overpayment'}
                    </FieldLabel>
                    <div className="simulation-allowance">
                      <Input
                        id={side}
                        value={draft[side]}
                        onChange={(event) => edit(side, event.target.value)}
                        required
                      />
                      <NativeSelect
                        aria-label={`${side === 'under' ? 'Underpayment' : 'Overpayment'} unit`}
                        value={draft[`${side}Unit`]}
                        onChange={(event) => edit(`${side}Unit`, event.target.value)}
                      >
                        <option value="fixed">ETB</option>
                        <option value="percentage">%</option>
                      </NativeSelect>
                    </div>
                  </Field>
                ))}
            </FieldGroup>
          </section>
          <section className="simulation-panel" aria-labelledby="simulation-evidence">
            <h2 id="simulation-evidence">Payment evidence</h2>
            <FieldGroup className="simulation-controls">
              <Field>
                <FieldLabel htmlFor="simulation-scenario">Scenario</FieldLabel>
                <NativeSelect
                  id="simulation-scenario"
                  value={scenario}
                  onChange={(event) => reset(draft.provider, event.target.value as Scenario)}
                >
                  {Object.entries(scenarios).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <fieldset className="simulation-tabs">
                <legend className="sr-only">Evidence format</legend>
                {evidenceTypes.map((type) => {
                  const Icon = icons[type];
                  return (
                    <label key={type}>
                      <input
                        type="radio"
                        name="evidence-type"
                        value={type}
                        checked={kind === type}
                        onChange={() => {
                          setKind(type);
                          setEvidence(sampleEvidence(draft.provider, type, scenario));
                        }}
                      />
                      <Icon size={16} aria-hidden="true" /> {type}
                    </label>
                  );
                })}
              </fieldset>
              <Field>
                <FieldLabel htmlFor="simulation-input">{kind}</FieldLabel>
                <Textarea
                  id="simulation-input"
                  value={evidence}
                  onChange={(event) => {
                    setEvidence(event.target.value);
                  }}
                  rows={kind === 'SMS' ? 5 : 2}
                  maxLength={PAYMENT_INPUT_LIMIT}
                  spellCheck={false}
                />
              </Field>
              <p className="simulation-preview" aria-live="polite">
                {evidence &&
                  (parsed.ok
                    ? `Detected ${parsed.value.provider === 'cbe' ? 'CBE' : 'Telebirr'} · ${parsed.value.inputType.replaceAll('_', ' ')} · ${parsed.value.identifier}`
                    : parsed.error.message)}
              </p>
              <div className="simulation-actions">
                <Button type="submit" disabled={busy}>
                  {busy && <LoadingIcon />}
                  {busy ? 'Checking receipt…' : 'Simulate verification'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => reset(draft.provider, scenario)}
                >
                  Load defaults
                </Button>
              </div>
            </FieldGroup>
          </section>
        </fieldset>
      </form>
      <p role="status" className="sr-only">
        {busy ? 'Checking receipt…' : ''}
      </p>
      <VerificationHistory
        entries={attempts.history.map(({ value, ...entry }) => ({
          ...entry,
          outcome: value.outcome,
        }))}
        detail="Attempts from this page session. Select a row to review its result."
        onOpen={attempts.open}
      />
      <VerificationDialog
        outcome={attempts.selected?.outcome}
        context={attempts.selected?.context ?? ''}
        checks={checkRows(attempts.selected?.result?.checks ?? [])}
        onClose={attempts.close}
        restoreFocus={attempts.restoreFocus}
      >
        {attempts.selected?.result && (
          <details>
            <summary>Developer diagnostics and JSON</summary>
            <pre tabIndex={0}>{JSON.stringify(attempts.selected.result, null, 2)}</pre>
          </details>
        )}
      </VerificationDialog>
    </>
  );
}

createRoot(document.getElementById('main')!).render(<Playground />);
