import { createRoot } from 'react-dom/client';
import { ReceiptCheckout } from './checkout';
import type { ReceiptResult, ReceiptSubmission } from './checkout';

const samples: { reference: string; description: string }[] = [
  { reference: 'DEMO-MATCH', description: 'Receipt details match' },
  { reference: 'DEMO-MISMATCH', description: 'Receipt details differ' },
  { reference: 'DEMO-RETRY', description: 'Provider unavailable once, then matches on retry' },
];

const unavailableOnce = new Set<string>();

async function submitMock({
  reference,
  paymentMethodId,
  signal,
}: ReceiptSubmission): Promise<ReceiptResult> {
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, 450);
    function onAbort(): void {
      window.clearTimeout(timer);
      reject(new Error('Demo request cancelled'));
    }
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  if (reference === 'DEMO-RETRY' && !unavailableOnce.has(paymentMethodId)) {
    unavailableOnce.add(paymentMethodId);
    return 'unavailable';
  }
  if (reference === 'DEMO-RETRY' || reference === 'DEMO-MATCH') return 'matched';
  return reference === 'DEMO-MISMATCH' ? 'mismatch' : 'rejected';
}

const element = document.getElementById('checkout-root');
if (element) {
  createRoot(element).render(
    <ReceiptCheckout
      branding={{ name: 'Juniper Supply', caption: 'Sample merchant', mark: 'J' }}
      order={{
        reference: 'Demo order #1048',
        lines: [
          {
            id: 'notebook',
            label: 'Field notebook',
            detail: 'Quantity 2',
            amountLabel: 'ETB 1,200.00',
          },
          { id: 'pen', label: 'Ink pen', detail: 'Quantity 1', amountLabel: 'ETB 280.00' },
        ],
        totalLabel: 'ETB 1,480.00',
      }}
      paymentMethods={[
        {
          id: 'bank',
          label: 'Demo bank transfer',
          instructions: 'Choose a sample reference below. Do not initiate a transfer.',
        },
        {
          id: 'wallet',
          label: 'Demo mobile wallet',
          instructions: 'The same sample references work here. Do not send money.',
        },
      ]}
      onSubmitReceipt={submitMock}
      validateReference={(reference) =>
        reference.startsWith('DEMO-') ? undefined : 'Use a synthetic reference starting with DEMO-.'
      }
      sections={{
        orderFooter: <p>Bank settlement and delivery are separate from the receipt check.</p>,
        receiptHelp: (
          <aside className="samples" aria-label="Synthetic sample references">
            <p>TRY A SAMPLE REFERENCE</p>
            <ul role="list">
              {samples.map((sample) => (
                <li key={sample.reference}>
                  <code>{sample.reference}</code>
                  <span>{sample.description}</span>
                </li>
              ))}
            </ul>
          </aside>
        ),
      }}
    />,
  );
}
