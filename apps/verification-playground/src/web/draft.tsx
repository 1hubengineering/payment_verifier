import { ControlButton, NativeSelect, TextInput } from '@1hubengineering/payment-web-ui';
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
        <ControlButton type="button" variant="ghost" onClick={props.reset} disabled={disabled}>
          Reset defaults
        </ControlButton>
      </div>
      <form onSubmit={props.register}>
        <fieldset disabled={disabled}>
          <div className="field-grid">
            <label>
              Provider
              <NativeSelect
                value={draft.provider}
                onChange={(event) =>
                  change('provider', event.target.value === 'cbe' ? 'cbe' : 'telebirr')
                }
              >
                <option value="telebirr">Telebirr</option>
                <option value="cbe">CBE</option>
              </NativeSelect>
            </label>
            <label>
              Expected amount (ETB)
              <TextInput
                value={draft.amount}
                onChange={(event) => change('amount', event.target.value)}
                inputMode="decimal"
                required
                maxLength={18}
              />
            </label>
            <label>
              Recipient name
              <TextInput
                value={draft.recipientName}
                onChange={(event) => change('recipientName', event.target.value)}
                required
                maxLength={120}
              />
            </label>
            <label>
              Recipient account last four
              <TextInput
                value={draft.recipientAccountLast4}
                onChange={(event) => change('recipientAccountLast4', event.target.value)}
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                required
              />
            </label>
            <div className="full">
              <label>
                Invoice or order reference
                <textarea
                  value={draft.reference}
                  onChange={(event) => change('reference', event.target.value)}
                  aria-describedby="reference-receipt-field"
                  required={draft.referenceRequired !== false}
                  maxLength={255}
                  rows={2}
                />
              </label>
              <small className="muted" id="reference-receipt-field">
                Your order reference should appear in{' '}
                {draft.provider === 'cbe' ? 'Reason / Type of service' : 'Customer Note'} on the
                official receipt.
              </small>
              <label className="checkbox">
                <TextInput
                  type="checkbox"
                  checked={draft.referenceRequired === false}
                  onChange={(event) => change('referenceRequired', !event.target.checked)}
                />
                Allow a blank reference
              </label>
              {draft.referenceRequired === false && (
                <small className="muted">A blank reference matches a blank receipt note.</small>
              )}
            </div>
            <label>
              Valid from
              <TextInput
                type="datetime-local"
                required
                value={localDate(draft.validFrom)}
                onChange={(event) => change('validFrom', isoDate(event.target.value))}
              />
            </label>
            <label>
              Expires at
              <TextInput
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
            <NativeSelect
              value={draft.tolerance ? 'tolerance' : 'exact'}
              onChange={(event) => change('tolerance', event.target.value === 'tolerance')}
            >
              <option value="exact">Exact match</option>
              <option value="tolerance">Tolerance</option>
            </NativeSelect>
          </label>
          {draft.tolerance && (
            <div className="field-grid allowances">
              {(['under', 'over'] as const).map((key) => (
                <div key={key}>
                  <label>
                    {key === 'under' ? 'Maximum underpayment' : 'Maximum overpayment'}
                    <TextInput
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
                    <NativeSelect
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
                    </NativeSelect>
                  </label>
                </div>
              ))}
            </div>
          )}
          <div className="actions">
            <ControlButton type="button" onClick={props.preview}>
              Preview range
            </ControlButton>
            <ControlButton type="submit">Create test payment</ControlButton>
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
              <NativeSelect
                value={selected?.id ?? ''}
                onChange={(event) => props.load(event.target.value)}
              >
                <option value="">New draft</option>
                {drafts.map((value) => (
                  <option key={value.id} value={value.id}>
                    {value.name}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label>
              Configuration name
              <TextInput
                value={props.name}
                onChange={(event) => props.setName(event.target.value)}
                maxLength={80}
              />
            </label>
            <div className="actions">
              <ControlButton
                type="button"
                onClick={() => props.save(false)}
                disabled={!props.name.trim()}
              >
                {selected ? 'Save copy' : 'Save draft'}
              </ControlButton>
              {selected && (
                <>
                  <ControlButton
                    type="button"
                    onClick={() => props.save(true)}
                    disabled={!props.name.trim()}
                  >
                    Update draft
                  </ControlButton>
                  <ControlButton type="button" onClick={props.remove}>
                    Delete draft
                  </ControlButton>
                </>
              )}
            </div>
          </details>
        </fieldset>
      </form>
    </section>
  );
}
