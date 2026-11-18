import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';

export type ReceiptResult = 'matched' | 'mismatch' | 'unavailable' | 'rejected';

export interface ReceiptSubmission {
  readonly reference: string;
  readonly paymentMethodId: string;
  readonly signal: AbortSignal;
}

export interface CheckoutProps {
  branding: { name: string; mark?: ReactNode; caption?: string };
  order: {
    reference: string;
    lines: readonly { id: string; label: string; detail?: string; amountLabel: string }[];
    totalLabel: string;
  };
  paymentMethods: readonly { id: string; label: string; instructions: string }[];
  onSubmitReceipt: (submission: ReceiptSubmission) => Promise<ReceiptResult>;
  validateReference?: (reference: string) => string | undefined;
  sections?: { receiptHelp?: ReactNode; orderFooter?: ReactNode };
}

type Status = ReceiptResult | 'idle' | 'submitting' | 'error';

const resultCopy: Record<ReceiptResult | 'error', { title: string; detail: string }> = {
  matched: {
    title: 'Receipt details match',
    detail:
      'The receipt matches the expected details. Settlement is unconfirmed and fulfillment is not authorized.',
  },
  mismatch: {
    title: 'Receipt details did not match',
    detail: 'Check the payment method and reference before trying again. No payment was confirmed.',
  },
  unavailable: {
    title: 'Receipt provider unavailable',
    detail:
      'The receipt could not be checked. Retry the same reference when the provider is available.',
  },
  rejected: {
    title: 'Receipt not accepted',
    detail: 'Check the reference or contact the merchant for help. No payment was confirmed.',
  },
  error: {
    title: 'Could not submit the receipt',
    detail: 'Try again with the same reference. No payment was confirmed.',
  },
};

export function OrderSummary({
  branding,
  order,
  footer,
}: Pick<CheckoutProps, 'branding' | 'order'> & { footer?: ReactNode }) {
  return (
    <Card className="order-summary">
      <CardHeader>
        <div className="merchant">
          {branding.mark && (
            <span className="merchant-mark" aria-hidden="true">
              {branding.mark}
            </span>
          )}
          <div>
            <p className="merchant-name">{branding.name}</p>
            {branding.caption && <p className="text-muted-foreground">{branding.caption}</p>}
          </div>
        </div>
        <CardTitle>
          <h2>Order summary</h2>
        </CardTitle>
        <CardDescription>{order.reference}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="line-items" role="list">
          {order.lines.map((line) => (
            <li key={line.id}>
              <div>
                <p>{line.label}</p>
                {line.detail && <p className="text-muted-foreground">{line.detail}</p>}
              </div>
              <span>{line.amountLabel}</span>
            </li>
          ))}
        </ul>
        <div className="order-total">
          <span>Total</span>
          <strong>{order.totalLabel}</strong>
        </div>
      </CardContent>
      <CardFooter className="flex-col items-start gap-3">
        <Badge variant="outline">Receipt check only</Badge>
        {footer}
      </CardFooter>
    </Card>
  );
}

export function ReceiptCheckout({
  branding,
  order,
  paymentMethods,
  onSubmitReceipt,
  validateReference,
  sections,
}: CheckoutProps) {
  const identifier = useId();
  const input = useRef<HTMLInputElement>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<string>();
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const method = paymentMethods.find((option) => option.id === selectedMethod) ?? paymentMethods[0];
  const pending = status === 'submitting';
  const result = status === 'idle' || status === 'submitting' ? null : resultCopy[status];
  const retry = status === 'unavailable' || status === 'error';

  useEffect(
    () => () => {
      activeRequest.current?.abort();
      activeRequest.current = null;
    },
    [],
  );

  function resetFeedback(): void {
    setStatus('idle');
    setError('');
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (activeRequest.current || !method) return;
    const trimmed = reference.trim();
    const validation = !trimmed
      ? 'Enter a receipt reference.'
      : trimmed.length > 4096
        ? 'Use a receipt reference of at most 4096 characters.'
        : validateReference?.(trimmed);
    if (validation) {
      setError(validation);
      setStatus('idle');
      input.current?.focus();
      return;
    }

    const request = new AbortController();
    activeRequest.current = request;
    setError('');
    setStatus('submitting');
    try {
      const outcome = await onSubmitReceipt({
        reference: trimmed,
        paymentMethodId: method.id,
        signal: request.signal,
      });
      if (activeRequest.current === request) {
        setStatus(
          outcome === 'matched' ||
            outcome === 'mismatch' ||
            outcome === 'unavailable' ||
            outcome === 'rejected'
            ? outcome
            : 'error',
        );
      }
    } catch {
      if (activeRequest.current === request) setStatus('error');
    } finally {
      if (activeRequest.current === request) activeRequest.current = null;
    }
  }

  return (
    <div className="checkout-layout">
      <OrderSummary branding={branding} order={order} footer={sections?.orderFooter} />
      <Card className="receipt-card">
        <CardHeader>
          <p className="eyebrow">RECEIPT VERIFICATION</p>
          <CardTitle>
            <h2>Check a receipt</h2>
          </CardTitle>
          <CardDescription>Choose the method used and enter the receipt reference.</CardDescription>
        </CardHeader>
        <form
          noValidate
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <CardContent>
            {method ? (
              <FieldGroup>
                <FieldSet disabled={pending}>
                  <FieldLegend>Payment method</FieldLegend>
                  <div className="method-list">
                    {paymentMethods.map((option) => (
                      <label className="method-option" key={option.id}>
                        <input
                          type="radio"
                          name={`${identifier}-method`}
                          checked={option.id === method.id}
                          onChange={() => {
                            setSelectedMethod(option.id);
                            resetFeedback();
                          }}
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                  <FieldDescription>{method.instructions}</FieldDescription>
                </FieldSet>
                <Field
                  data-invalid={error ? true : undefined}
                  data-disabled={pending ? true : undefined}
                >
                  <FieldLabel htmlFor={`${identifier}-reference`}>Receipt reference</FieldLabel>
                  <Input
                    ref={input}
                    id={`${identifier}-reference`}
                    name="reference"
                    autoComplete="off"
                    spellCheck={false}
                    required
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? `${identifier}-error` : undefined}
                    value={reference}
                    disabled={pending}
                    onChange={(event) => {
                      setReference(event.target.value);
                      resetFeedback();
                    }}
                  />
                  {error && (
                    <p id={`${identifier}-error`} role="alert">
                      {error}
                    </p>
                  )}
                </Field>
              </FieldGroup>
            ) : (
              <Alert>
                <AlertTitle>No payment methods configured</AlertTitle>
                <AlertDescription>
                  Contact the merchant for help checking a receipt.
                </AlertDescription>
              </Alert>
            )}
            {sections?.receiptHelp}
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-3">
            <Button type="submit" size="lg" disabled={pending || !method}>
              {pending && (
                <Spinner data-icon="inline-start" aria-hidden="true" role="presentation" />
              )}
              {pending ? 'Checking receipt…' : retry ? 'Retry receipt check' : 'Check receipt'}
            </Button>
            <div role="status" aria-live="polite" aria-atomic="true">
              {pending && <span className="sr-only">Checking receipt…</span>}
              {result && (
                <Alert role="presentation" variant={status === 'error' ? 'destructive' : 'default'}>
                  <AlertTitle>{result.title}</AlertTitle>
                  <AlertDescription>{result.detail}</AlertDescription>
                </Alert>
              )}
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
