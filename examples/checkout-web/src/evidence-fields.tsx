import type { KeyboardEvent } from 'react';
import { useState } from 'react';
import { Copy, Hash, Link, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { EvidenceKind } from './demo-evidence';

export const evidenceTabs = [
  {
    id: 'transaction',
    label: 'Transaction number',
    icon: Hash,
    hint: 'Find this number in your transfer history or confirmation message.',
  },
  {
    id: 'url',
    label: 'Receipt URL',
    icon: Link,
    hint: 'Paste the full HTTPS receipt link from the provider.',
  },
  {
    id: 'sms',
    label: 'Full SMS message',
    icon: MessageSquare,
    hint: 'Paste the whole sample message. You do not have to find the reference first.',
  },
] as const;

export function EvidenceTabs({
  identifier,
  selected,
  select,
  disabled,
}: {
  identifier: string;
  selected: EvidenceKind;
  select: (kind: EvidenceKind) => void;
  disabled: boolean;
}) {
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? evidenceTabs.length - 1
          : event.key === 'ArrowRight'
            ? index + 1
            : event.key === 'ArrowLeft'
              ? index - 1
              : undefined;
    if (next === undefined) return;
    event.preventDefault();
    const target = evidenceTabs[(next + evidenceTabs.length) % evidenceTabs.length];
    if (!target) return;
    select(target.id);
    document.getElementById(`${identifier}-tab-${target.id}`)?.focus();
  }

  return (
    <div className="evidence-tabs" role="tablist" aria-label="Evidence type">
      {evidenceTabs.map(({ id, label, icon: Icon }, index) => (
        <button
          key={id}
          type="button"
          role="tab"
          id={`${identifier}-tab-${id}`}
          aria-controls={`${identifier}-panel-${id}`}
          aria-selected={id === selected}
          tabIndex={id === selected ? 0 : -1}
          disabled={disabled}
          onClick={() => select(id)}
          onKeyDown={(event) => navigate(event, index)}
        >
          <Icon size={17} aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}

export function TransferDetails({
  details,
}: {
  details: readonly { label: string; value: string; copy?: string }[];
}) {
  const [message, setMessage] = useState('');

  async function copy(label: string, value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(`Copied ${label.toLowerCase()}.`);
    } catch {
      setMessage('Copy was blocked. Select the text to copy it manually.');
    }
  }

  return (
    <div className="transfer-details">
      <dl>
        {details.map(({ label, value, copy: copyValue }) => (
          <div className="transfer-detail" key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={`Copy ${label.toLowerCase()}`}
              title={`Copy ${label.toLowerCase()}`}
              onClick={() => {
                void copy(label, copyValue ?? value);
              }}
            >
              <Copy aria-hidden="true" />
            </Button>
          </div>
        ))}
      </dl>
      <p className="transfer-feedback" role="status">
        {message}
      </p>
    </div>
  );
}
