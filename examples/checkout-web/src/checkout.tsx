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
import { EvidenceTabs, evidenceTabs, TransferDetails } from './evidence-fields';
import type { EvidenceKind } from './demo-evidence';

export type ReceiptResult =
  | 'matched'
  | 'mismatch'
  | 'unavailable'
  | 'rejected'
  | 'review'
  | 'duplicate';

export interface ReceiptSubmission {
  readonly reference: string;
  readonly paymentMethodId: string;
  readonly signal: AbortSignal;
  readonly kind?: EvidenceKind;
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
    placeholders?: Readonly<Record<EvidenceKind, string>>;
  }[];
  onSubmitReceipt: (submission: ReceiptSubmission) => Promise<ReceiptResult>;
  validateReference?: (reference: string) => string | undefined;
  evidence?: {
    simulated?: boolean;
    validate?: (input: Omit<ReceiptSubmission, 'signal'>) => string | undefined;
    sample?: (method: string, kind: EvidenceKind) => string | undefined;
  };
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
  review: {
    title: 'Pending review',
    detail: 'We could not confirm these details from a trusted record. No payment was confirmed.',
  },
  duplicate: {
    title: 'Evidence already submitted',
    detail: 'This transaction has already been recorded. It does not confirm settlement.',
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
  evidence,
  sections,
}: CheckoutProps) {
  const identifier = useId();
  const activeRequest = useRef<AbortController | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<string>();
  const [kind, setKind] = useState<EvidenceKind>('transaction');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const method = paymentMethods.find((option) => option.id === selectedMethod) ?? paymentMethods[0];
  const draftKey = JSON.stringify([method?.id, kind]);
  const reference = drafts[draftKey] ?? '';
  const currentTab = evidenceTabs.find((tab) => tab.id === kind) ?? evidenceTabs[0];
  const sample = method && evidence?.sample?.(method.id, kind);
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

  function updateReference(value: string): void {
    setDrafts((previous) => ({ ...previous, [draftKey]: value }));
    resetFeedback();
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (activeRequest.current || !method) return;
    const trimmed = reference.trim();
    const submission = {
      reference: trimmed,
      paymentMethodId: method.id,
      ...(evidence ? { kind } : {}),
    };
    const validation = !trimmed
      ? evidence
        ? `Enter the ${currentTab.label.toLowerCase()}.`
        : 'Enter a receipt reference.'
      : trimmed.length > 4096
        ? 'Use at most 4096 characters.'
        : evidence
          ? evidence.validate?.(submission)
          : validateReference?.(trimmed);
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
        setStatus(
          outcome === 'matched' ||
            outcome === 'mismatch' ||
            outcome === 'unavailable' ||
            outcome === 'rejected' ||
            outcome === 'review' ||
            outcome === 'duplicate'
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

  const fieldProps = {
    id: `${identifier}-reference`,
    name: 'reference',
    autoComplete: 'off',
    spellCheck: false,
    required: true,
    maxLength: 4096,
    'aria-invalid': error ? true : undefined,
    'aria-describedby':
      [evidence ? `${identifier}-hint` : '', error ? `${identifier}-error` : '']
        .filter(Boolean)
        .join(' ') || undefined,
    placeholder: method?.placeholders?.[kind],
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
                {evidence && (
                  <div className="evidence-heading">
                    <p className="eyebrow">PAYMENT VERIFICATION</p>
                    <h2>Submit your evidence</h2>
                    <p>
                      {evidence.simulated
                        ? 'Use a sample below. Do not paste a real receipt or SMS.'
                        : 'After you transfer, submit one of the following.'}
                    </p>
                  </div>
                )}
                {evidence && (
                  <EvidenceTabs
                    identifier={identifier}
                    selected={kind}
                    disabled={pending}
                    select={(value) => {
                      setKind(value);
                      resetFeedback();
                    }}
                  />
                )}
                {evidence &&
                  evidenceTabs
                    .filter((tab) => tab.id !== kind)
                    .map((tab) => (
                      <div
                        key={tab.id}
                        role="tabpanel"
                        id={`${identifier}-panel-${tab.id}`}
                        aria-labelledby={`${identifier}-tab-${tab.id}`}
                        hidden
                      />
                    ))}
                <div
                  role={evidence ? 'tabpanel' : undefined}
                  id={evidence ? `${identifier}-panel-${kind}` : undefined}
                  aria-labelledby={evidence ? `${identifier}-tab-${kind}` : undefined}
                >
                  <Field
                    data-invalid={error ? true : undefined}
                    data-disabled={pending ? true : undefined}
                  >
                    <FieldLabel htmlFor={fieldProps.id}>
                      {evidence ? currentTab.label : 'Receipt reference'}
                    </FieldLabel>
                    {kind === 'sms' ? (
                      <textarea
                        {...fieldProps}
                        rows={4}
                        className="evidence-textarea"
                        onChange={(event) => updateReference(event.target.value)}
                      />
                    ) : (
                      <Input
                        {...fieldProps}
                        type={kind === 'url' ? 'url' : 'text'}
                        onChange={(event) => updateReference(event.target.value)}
                      />
                    )}
                    {evidence && (
                      <FieldDescription id={`${identifier}-hint`}>
                        {currentTab.hint}
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
                      Use sample {kind === 'sms' ? 'SMS' : kind === 'url' ? 'URL' : 'number'}
                    </Button>
                  )}
                </div>
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
                    {evidence?.simulated && status === 'matched' ? 'Simulated match' : result.title}
                  </AlertTitle>
                  <AlertDescription>
                    {evidence?.simulated && status === 'matched'
                      ? 'The sample matched an offline demo record. No payment was made. Settlement remains unconfirmed.'
                      : evidence?.simulated && status === 'review'
                        ? 'The demo could not confirm this evidence. Nothing was sent to a reviewer or a provider.'
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
