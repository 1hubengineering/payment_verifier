import type { FormEvent } from 'react';
import type { Bounds, Draft, SavedDraft } from '../contracts.ts';

export function amount(minor: number): string {
  const value = BigInt(minor);
  const magnitude = value < 0n ? -value : value;
  return `${value < 0n ? '−' : ''}${magnitude / 100n}.${String(magnitude % 100n).padStart(2, '0')} ETB`;
}

function localDate(iso: string): string {
  if (!iso) return '';
  const time = new Date(iso);
  return new Date(time.getTime() - time.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
function isoDate(local: string): string {
  return local ? new Date(local).toISOString() : '';
}

interface Props {
  draft: Draft;
  setDraft: (draft: Draft) => void;
  drafts: SavedDraft[];
  selected: SavedDraft | undefined;
  name: string;
  setName: (value: string) => void;
  load: (id: string) => void;
  save: (update: boolean) => void;
  remove: () => void;
  reset: () => void;
  register: (event: FormEvent) => void;
  preview: () => void;
  paymentId: string | undefined;
  bounds: Bounds | undefined;
  disabled: boolean;
}

export function DraftPanel(props: Props) {
  const { draft, setDraft, drafts, selected, paymentId, bounds, disabled } = props;
  function change<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft({ ...draft, [key]: value });
  }
  return (
    <section className="panel" aria-labelledby="expected-title">
      <div className="section-title">
        <h2 id="expected-title">Expected payment</h2>
        <button type="button" className="text-button" onClick={props.reset} disabled={disabled}>
          Reset defaults
        </button>
      </div>
      <form onSubmit={props.register}>
        <fieldset disabled={disabled}>
          <div className="field-grid">
            <label>
              Provider
              <select
                value={draft.provider}
                onChange={(event) =>
                  change('provider', event.target.value === 'cbe' ? 'cbe' : 'telebirr')
                }
              >
                <option value="telebirr">Telebirr</option>
                <option value="cbe">CBE</option>
              </select>
            </label>
            <label>
              Expected amount (ETB)
              <input
                value={draft.amount}
                onChange={(event) => change('amount', event.target.value)}
                inputMode="decimal"
                required
                maxLength={18}
              />
            </label>
            <label>
              Recipient name
              <input
                value={draft.recipientName}
                onChange={(event) => change('recipientName', event.target.value)}
                required
                maxLength={120}
              />
            </label>
            <label>
              Recipient account last four
              <input
                value={draft.recipientAccountLast4}
                onChange={(event) => change('recipientAccountLast4', event.target.value)}
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                required
              />
            </label>
            <label className="full">
              Invoice or order reference
              <input
                value={draft.reference}
                onChange={(event) => change('reference', event.target.value)}
                required
                maxLength={120}
              />
            </label>
            <label>
              Valid from
              <input
                type="datetime-local"
                required
                value={localDate(draft.validFrom)}
                onChange={(event) => change('validFrom', isoDate(event.target.value))}
              />
            </label>
            <label>
              Expires at
              <input
                type="datetime-local"
                required
                value={localDate(draft.validUntil)}
                onChange={(event) => change('validUntil', isoDate(event.target.value))}
              />
            </label>
          </div>
          <p className="muted">
            Account matching uses the last four digits. Dates use your browser’s time zone.
          </p>
          <label>
            Amount policy
            <select
              value={draft.tolerance ? 'tolerance' : 'exact'}
              onChange={(event) => change('tolerance', event.target.value === 'tolerance')}
            >
              <option value="exact">Exact match</option>
              <option value="tolerance">Tolerance</option>
            </select>
          </label>
          {draft.tolerance && (
            <div className="field-grid allowances">
              {(['under', 'over'] as const).map((key) => (
                <div key={key}>
                  <label>
                    {key === 'under' ? 'Maximum underpayment' : 'Maximum overpayment'}
                    <input
                      inputMode="decimal"
                      value={draft[key].value}
                      maxLength={18}
                      onChange={(event) =>
                        change(key, { ...draft[key], value: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Unit
                    <select
                      value={draft[key].unit}
                      onChange={(event) =>
                        change(key, {
                          ...draft[key],
                          unit: event.target.value === 'fixed' ? 'fixed' : 'percentage',
                        })
                      }
                    >
                      <option value="fixed">ETB</option>
                      <option value="percentage">Percent</option>
                    </select>
                  </label>
                </div>
              ))}
            </div>
          )}
          <div className="actions">
            <button type="button" onClick={props.preview}>
              Preview range
            </button>
            <button type="submit">Create test payment</button>
          </div>
          {bounds && (
            <p className="summary-line">
              Accepted range{' '}
              <strong>
                {amount(bounds.minimumAcceptedMinor)} to {amount(bounds.maximumAcceptedMinor)}
              </strong>
            </p>
          )}
          {paymentId && (
            <p className="summary-line">
              Internal payment ID <code>{paymentId}</code>
            </p>
          )}
          <details className="saved">
            <summary>Saved configurations</summary>
            <label>
              Load saved draft
              <select
                value={selected?.id ?? ''}
                onChange={(event) => props.load(event.target.value)}
              >
                <option value="">New draft</option>
                {drafts.map((value) => (
                  <option key={value.id} value={value.id}>
                    {value.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Configuration name
              <input
                value={props.name}
                onChange={(event) => props.setName(event.target.value)}
                maxLength={80}
              />
            </label>
            <div className="actions">
              <button type="button" onClick={() => props.save(false)} disabled={!props.name.trim()}>
                {selected ? 'Save copy' : 'Save draft'}
              </button>
              {selected && (
                <>
                  <button
                    type="button"
                    onClick={() => props.save(true)}
                    disabled={!props.name.trim()}
                  >
                    Update draft
                  </button>
                  <button type="button" onClick={props.remove}>
                    Delete draft
                  </button>
                </>
              )}
            </div>
          </details>
        </fieldset>
      </form>
    </section>
  );
}
