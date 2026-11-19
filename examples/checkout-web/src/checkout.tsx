import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { Spinner } from '@/components/ui/spinner';
import { TransferDetails } from './evidence-fields';
import { PAYMENT_INPUT_LIMIT } from '@1hubengineering/verifier/input';
import type { VerificationStatus } from '@1hubengineering/verifier';

export type ReceiptResult = {
  readonly status: VerificationStatus | 'RECEIPT_ALREADY_CLAIMED';
  readonly retryable: boolean;
};

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
    copyAmount?: string;
  };
  paymentMethods: readonly {
    id: string;
    label: string;
    instructions: string;
    subtitle?: string;
    logo?: string;
    receiving?: { holder: string; accountLabel: string; account: string };
    placeholder?: string;
  }[];
  onSubmitReceipt: (submission: ReceiptSubmission) => Promise<ReceiptResult>;
  validateReference?: (reference: string) => string | undefined;
  evidence?: {
    simulated?: boolean;
    validate?: (input: Omit<ReceiptSubmission, 'signal'>) => string | undefined;
    sample?: (method: string) => string | undefined;
  };
  sections?: { receiptHelp?: ReactNode; orderFooter?: ReactNode };
}

type Status = ReceiptResult['status'] | 'idle' | 'submitting' | 'error';

const resultCopy: Record<ReceiptResult['status'] | 'error', { title: string; detail: string }> = {
  VERIFIED: { title: 'Payment verified', detail: 'The official receipt matches this order.' },
  MISMATCH: {
    title: 'Receipt details did not match',
    detail: 'Check the payment details or contact the merchant.',
  },
  UNAVAILABLE: {
    title: 'Receipt could not be checked',
    detail: 'The provider could not supply enough reliable information.',
  },
  INVALID_INPUT: {
    title: 'Receipt input not accepted',
    detail: 'Check your receipt number, link, or message.',
  },
  NOT_FOUND: {
    title: 'Receipt not found',
    detail: 'Check the confirmation from your payment provider.',
  },
  RECEIPT_ALREADY_CLAIMED: {
    title: 'Receipt already submitted',
    detail: 'This transaction has already been recorded.',
  },
  error: {
    title: 'Could not submit the receipt',
    detail: 'Retry this submission or contact the merchant.',
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
      {footer && <CardFooter className="flex-col items-start gap-3">{footer}</CardFooter>}
    </Card>
  );
}

export function ReceiptCheckout({
  branding,
  order,
  paymentMethods,
  onSubmitReceipt,
  validateReference,
  evidence,
  sections,
}: CheckoutProps) {
  const identifier = useId();
  const activeRequest = useRef<AbortController | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<string>();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const method = paymentMethods.find((option) => option.id === selectedMethod) ?? paymentMethods[0];
  const draftKey = method?.id ?? '';
  const reference = drafts[draftKey] ?? '';
  const sample = method && evidence?.sample?.(method.id);
  const pending = status === 'submitting';
  const result = status === 'idle' || status === 'submitting' ? null : resultCopy[status];
  const [retry, setRetry] = useState(false);

  useEffect(
    () => () => {
      activeRequest.current?.abort();
      activeRequest.current = null;
    },
    [],
  );

  function resetFeedback(): void {
    setStatus('idle');
    setRetry(false);
    setError('');
  }

  function updateReference(value: string): void {
    setDrafts((previous) => ({ ...previous, [draftKey]: value }));
    resetFeedback();
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (activeRequest.current || !method) return;
    const trimmed = reference.trim();
    const submission = { reference: trimmed, paymentMethodId: method.id };
    const validation = !trimmed
      ? 'Enter a receipt reference.'
      : reference.length > PAYMENT_INPUT_LIMIT
        ? `Use at most ${PAYMENT_INPUT_LIMIT} characters.`
        : (evidence?.validate?.(submission) ?? validateReference?.(trimmed));
    if (validation) {
      setError(validation);
      setStatus('idle');
      document.getElementById(`${identifier}-reference`)?.focus();
      return;
    }

    const request = new AbortController();
    activeRequest.current = request;
    setError('');
    setStatus('submitting');
    try {
      const outcome = await onSubmitReceipt({
        ...submission,
        signal: request.signal,
      });
      if (activeRequest.current === request) {
        setStatus(outcome.status);
        setRetry(outcome.retryable);
      }
    } catch {
      if (activeRequest.current === request) {
        setStatus('error');
        setRetry(true);
      }
    } finally {
      if (activeRequest.current === request) activeRequest.current = null;
    }
  }

  const fieldProps = {
    id: `${identifier}-reference`,
    name: 'reference',
    autoComplete: 'off',
    spellCheck: false,
    required: true,
    maxLength: PAYMENT_INPUT_LIMIT,
    'aria-invalid': error ? true : undefined,
    'aria-describedby':
      [evidence ? `${identifier}-hint` : '', error ? `${identifier}-error` : '']
        .filter(Boolean)
        .join(' ') || undefined,
    placeholder: method?.placeholder,
    value: reference,
    disabled: pending,
  };

  return (
    <div className={evidence ? 'checkout-layout evidence-checkout' : 'checkout-layout'}>
      <OrderSummary branding={branding} order={order} footer={sections?.orderFooter} />
      <Card className="receipt-card">
        <CardHeader>
          <p className="eyebrow">{evidence ? 'PAYMENT INSTRUCTIONS' : 'RECEIPT VERIFICATION'}</p>
          <CardTitle>
            <h2>{evidence ? 'Choose how to pay' : 'Check a receipt'}</h2>
          </CardTitle>
          <CardDescription>
            {evidence?.simulated
              ? 'These details are examples. Do not send money.'
              : evidence
                ? 'Use the account details for your selected method.'
                : 'Choose the method used and enter the receipt reference.'}
          </CardDescription>
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
                        {option.logo && <img src={option.logo} alt="" className="method-logo" />}
                        <span>
                          <strong>{option.label}</strong>
                          {option.subtitle && (
                            <span className="method-subtitle">{option.subtitle}</span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                  <FieldDescription>{method.instructions}</FieldDescription>
                </FieldSet>
                {method.receiving && (
                  <TransferDetails
                    key={method.id}
                    details={[
                      { label: 'Account holder', value: method.receiving.holder },
                      { label: method.receiving.accountLabel, value: method.receiving.account },
                      {
                        label: 'Amount',
                        value: order.totalLabel,
                        copy: order.copyAmount ?? order.totalLabel,
                      },
                      { label: 'Invoice number', value: order.reference },
                    ]}
                  />
                )}
                <Field
                  data-invalid={error ? true : undefined}
                  data-disabled={pending ? true : undefined}
                >
                  <FieldLabel htmlFor={fieldProps.id}>Receipt reference</FieldLabel>
                  <textarea
                    {...fieldProps}
                    rows={3}
                    className="evidence-textarea"
                    onChange={(event) => updateReference(event.target.value)}
                  />
                  {evidence && (
                    <FieldDescription id={`${identifier}-hint`}>
                      {evidence.simulated
                        ? 'Use the sample or paste a synthetic transaction number, receipt link, or SMS.'
                        : 'Paste a transaction number, receipt link, or full SMS.'}
                    </FieldDescription>
                  )}
                  {error && (
                    <p id={`${identifier}-error`} role="alert">
                      {error}
                    </p>
                  )}
                </Field>
                {sample && (
                  <Button
                    type="button"
                    variant="outline"
                    className="sample-button"
                    disabled={pending}
                    onClick={() => updateReference(sample)}
                  >
                    Use sample SMS
                  </Button>
                )}
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
              {pending
                ? 'Checking receipt…'
                : evidence && !retry
                  ? 'Submit Payment for Verification'
                  : retry
                    ? 'Retry receipt check'
                    : 'Check receipt'}
            </Button>
            <div role="status" aria-live="polite" aria-atomic="true">
              {pending && <span className="sr-only">Checking receipt…</span>}
              {result && (
                <Alert role="presentation" variant={status === 'error' ? 'destructive' : 'default'}>
                  <AlertTitle>
                    {evidence?.simulated && status === 'VERIFIED'
                      ? 'Simulated verification'
                      : result.title}
                  </AlertTitle>
                  <AlertDescription>
                    {evidence?.simulated && status === 'VERIFIED'
                      ? 'The sample passed the checks against a simulated provider record.'
                      : result.detail}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
