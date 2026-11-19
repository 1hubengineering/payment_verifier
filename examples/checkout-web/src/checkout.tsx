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
import {
  checkRows,
  describeOutcome,
  Textarea,
  useVerificationHistory,
  VerificationDialog,
  VerificationHistory,
} from '@1hubengineering/payment-web-ui';
import type { Outcome } from '@1hubengineering/payment-web-ui';
import type { VerificationCheck, VerificationStatus } from '@1hubengineering/verifier';

export type ReceiptResult = {
  readonly status: VerificationStatus | 'RECEIPT_ALREADY_CLAIMED';
  readonly retryable: boolean;
  readonly checks?: readonly VerificationCheck[];
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

type Attempt = {
  outcome: Outcome;
  context: string;
  checks?: readonly VerificationCheck[];
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
  const [pending, setPending] = useState(false);
  const attempts = useVerificationHistory<Attempt>();
  const method = paymentMethods.find((option) => option.id === selectedMethod) ?? paymentMethods[0];
  const draftKey = method?.id ?? '';
  const reference = drafts[draftKey] ?? '';
  const sample = method && evidence?.sample?.(method.id);
  const [retry, setRetry] = useState(false);

  useEffect(
    () => () => {
      activeRequest.current?.abort();
      activeRequest.current = null;
    },
    [],
  );

  function resetFeedback(): void {
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
      document.getElementById(`${identifier}-reference`)?.focus();
      return;
    }

    const request = new AbortController();
    activeRequest.current = request;
    setError('');
    setPending(true);
    const trigger = event.currentTarget.querySelector<HTMLButtonElement>('button[type="submit"]');
    const context = evidence?.simulated ? `Simulated · ${method.label}` : method.label;
    try {
      const outcome = await onSubmitReceipt({
        ...submission,
        signal: request.signal,
      });
      if (activeRequest.current === request) {
        attempts.save(
          {
            outcome: describeOutcome(outcome.status, { simulated: evidence?.simulated }),
            context,
            ...(outcome.checks ? { checks: outcome.checks } : {}),
          },
          context,
          trigger,
        );
        setRetry(outcome.retryable);
      }
    } catch {
      if (activeRequest.current === request) {
        attempts.save({ outcome: describeOutcome('error'), context }, context, trigger);
        setRetry(true);
      }
    } finally {
      if (activeRequest.current === request) {
        activeRequest.current = null;
        setPending(false);
      }
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
    <>
      {/* Order review and payment columns adapted from Shadcnblocks Checkout 4. */}
      <div className="checkout-layout">
        <Card className="receipt-card">
          <CardHeader>
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
            aria-busy={pending}
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
                    <Textarea
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
            </CardFooter>
          </form>
          <p role="status" className="sr-only">
            {pending ? 'Checking receipt…' : ''}
          </p>
        </Card>
        <OrderSummary branding={branding} order={order} footer={sections?.orderFooter} />
      </div>
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
        checks={checkRows(attempts.selected?.checks ?? [])}
        onClose={attempts.close}
        restoreFocus={attempts.restoreFocus}
      />
    </>
  );
}
