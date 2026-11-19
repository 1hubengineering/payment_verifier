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
import './synthetic-playground.css';

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
  const [result, setResult] = useState<ReturnType<ReturnType<typeof createSimulation>['run']>>();
  const [error, setError] = useState('');
  const parsed = detectPaymentInput(evidence);
  function reset(provider: Draft['provider'], next: Scenario) {
    setScenario(next);
    setDraft(sampleDraft(provider, next));
    setEvidence(sampleEvidence(provider, kind, next));
    setResult(undefined);
    setError('');
  }
  function edit<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setResult(undefined);
    setError('');
  }
  function verify(event: FormEvent) {
    event.preventDefault();
    setError('');
    setResult(undefined);
    try {
      const simulation = createSimulation();
      if (scenario === 'duplicate' || scenario === 'conflict') {
        const initial = simulation.run(draft, evidence, 'success', 'seed-payment', 'seed-key');
        if (initial.status !== 'VERIFIED') {
          setResult(initial);
          setError(
            'The prerequisite synthetic receipt must pass every check. Load the scenario defaults to retry.',
          );
          return;
        }
      }
      const next =
        scenario === 'conflict'
          ? simulation.run(draft, 'v2-', 'success', 'seed-payment', 'seed-key')
          : simulation.run(draft, evidence, scenario, 'demo-payment', 'demo-key');
      setResult(next);
    } catch {
      setError(
        'Check the amount, tolerance, invoice reference, last four digits, and UTC validity window.',
      );
    }
  }

  return (
    <>
      <div className="synthetic-heading">
        <span className="simulation-tag">SIMULATED</span>
        <h1>Synthetic verification playground</h1>
        <p>
          Explore receipt parsing and payment checks from the SDK 0.2.0 candidate. Use the sample
          evidence. All processing stays in your browser.
        </p>
      </div>
      <form onSubmit={verify} className="simulation-grid">
        <section className="simulation-panel" aria-labelledby="expected-payment">
          <h2 id="expected-payment">Expected payment</h2>
          <FieldGroup className="simulation-fields">
            <Field>
              <FieldLabel htmlFor="simulation-provider">Provider</FieldLabel>
              <select
                id="simulation-provider"
                value={draft.provider}
                onChange={(event) =>
                  reset(event.target.value === 'cbe' ? 'cbe' : 'telebirr', scenario)
                }
              >
                <option value="telebirr">Telebirr</option>
                <option value="cbe">CBE</option>
              </select>
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
              <select
                id="simulation-policy"
                value={draft.policy}
                onChange={(event) => edit('policy', event.target.value)}
              >
                <option value="exact">Exact amount</option>
                <option value="tolerance">With tolerance</option>
              </select>
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
                    <select
                      aria-label={`${side === 'under' ? 'Underpayment' : 'Overpayment'} unit`}
                      value={draft[`${side}Unit`]}
                      onChange={(event) => edit(`${side}Unit`, event.target.value)}
                    >
                      <option value="fixed">ETB</option>
                      <option value="percentage">%</option>
                    </select>
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
              <select
                id="simulation-scenario"
                value={scenario}
                onChange={(event) => reset(draft.provider, event.target.value as Scenario)}
              >
                {Object.entries(scenarios).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
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
                        setResult(undefined);
                        setError('');
                      }}
                    />
                    <Icon size={16} aria-hidden="true" /> {type}
                  </label>
                );
              })}
            </fieldset>
            <Field>
              <FieldLabel htmlFor="simulation-input">{kind}</FieldLabel>
              <textarea
                id="simulation-input"
                value={evidence}
                onChange={(event) => {
                  setEvidence(event.target.value);
                  setResult(undefined);
                  setError('');
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
                  : parsed.error.code)}
            </p>
            <div className="simulation-actions">
              <Button type="submit">Simulate verification</Button>
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
      </form>
      {error && (
        <p role="alert" className="simulation-error">
          {error}
        </p>
      )}
      {result && (
        <section className="simulation-panel simulation-result" aria-labelledby="simulation-report">
          <span className="simulation-tag">SIMULATED</span>
          <h2 id="simulation-report" role="status">
            {result.status.replaceAll('_', ' ')}
          </h2>
          <p>
            <code>{result.code}</code> · {result.stage.replaceAll('_', ' ')} ·{' '}
            {result.retryable ? 'Retryable' : 'Non-retryable'}
          </p>
          {result.checks.length > 0 && (
            <ul className="simulation-checks">
              {result.checks.map((check) => (
                <li key={check.field}>
                  <strong>{check.field}</strong> <span>{check.status}</span>
                  {check.field === 'amountMinor' && (
                    <small>
                      Expected {(check.expected / 100).toFixed(2)} ETB · Actual{' '}
                      {check.actual === null
                        ? 'unavailable'
                        : (check.actual / 100).toFixed(2) + ' ETB'}
                    </small>
                  )}
                </li>
              ))}
            </ul>
          )}
          <details>
            <summary>Simulated JSON diagnostics</summary>
            <pre>{JSON.stringify(result, null, 2)}</pre>
          </details>
        </section>
      )}
    </>
  );
}

createRoot(document.getElementById('main')!).render(<Playground />);
