import { useState } from 'react';
import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
