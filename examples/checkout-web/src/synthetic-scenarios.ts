import {
  compareReceipt,
  createPaymentExpectation,
  parseEtbAmount,
} from '@1hubengineering/verifier/comparison';
import type {
  AmountAllowance,
  ProviderId,
  ReceiptEvidence,
  VerificationCheck,
} from '@1hubengineering/verifier/comparison';
import { detectPaymentInput } from '@1hubengineering/verifier/input';

export const scenarios = {
  success: 'Successful verification',
  under: 'Underpayment',
  over: 'Overpayment',
  accepted: 'Accepted tolerance',
  rejected: 'Rejected tolerance',
  recipient: 'Recipient mismatch',
  invoice: 'Invoice mismatch',
  invalid: 'Invalid input',
  ambiguous: 'Ambiguous input',
  wrongProvider: 'Provider mismatch',
  missing: 'Receipt not found',
  timeout: 'Provider timeout',
  unsupported: 'Unsupported receipt format',
  duplicate: 'Duplicate receipt claim',
  conflict: 'Idempotency conflict',
} as const;
export type Scenario = keyof typeof scenarios;
export const evidenceTypes = ['Transaction ID', 'Receipt URL', 'SMS'] as const;
export type EvidenceType = (typeof evidenceTypes)[number];

const sampleTime = Date.parse('2026-11-19T09:00:00Z');
const sample = {
  amount: '100.55',
  recipient: 'Example Merchant',
  account: '1123',
  reference: 'INV-DEMO-1024',
};

export function sampleDraft(provider: ProviderId, scenario: Scenario) {
  const tolerance = scenario === 'accepted' || scenario === 'rejected';
  return {
    ...sample,
    provider,
    from: '2026-11-19T08:00',
    until: '2026-11-19T10:00',
    policy: tolerance ? 'tolerance' : 'exact',
    underUnit: 'fixed',
    under: '0.60',
    overUnit: 'percentage',
    over: '1.00',
  };
}
export type Draft = ReturnType<typeof sampleDraft>;

export function sampleEvidence(provider: ProviderId, type: EvidenceType, scenario: Scenario) {
  if (scenario === 'invalid') return 'v2-';
  if (scenario === 'ambiguous') return 'Receipt ID v2-SAMPLE42 or receipt ID v2-SAMPLE43.';
  const actualProvider =
    scenario === 'wrongProvider' ? (provider === 'cbe' ? 'telebirr' : 'cbe') : provider;
  const id = actualProvider === 'cbe' ? 'v2-SAMPLE42' : 'SYNDEMO42';
  const url =
    actualProvider === 'cbe'
      ? `https://mbreciept.cbe.com.et/${id}`
      : `https://transactioninfo.ethiotelecom.et/receipt/${id}`;
  if (type === 'SMS') return `Sample transfer of ETB 100.55 to Example Merchant. Receipt ${url}.`;
  return type === 'Receipt URL' ? url : id;
}

function allowance(unit: string, value: string): AmountAllowance {
  if (unit === 'percentage') return { type: 'percentage', percent: value };
  return { type: 'fixed', maxMinor: /^0(?:\.0{1,2})?$/u.test(value) ? 0 : parseEtbAmount(value) };
}

interface Result {
  mode: 'SIMULATED';
  status: string;
  code: string;
  stage: string;
  retryable: boolean;
  checks: readonly VerificationCheck[];
  replayed?: boolean;
}
function report(
  status: string,
  code: string,
  stage: string,
  checks: readonly VerificationCheck[] = [],
  retryable = false,
): Result {
  return { mode: 'SIMULATED', status, code, stage, retryable, checks };
}

export function createSimulation() {
  const claims = new Map<string, string>();
  const attempts = new Map<string, { binding: string; result: Result }>();

  function run(
    draft: Draft,
    text: string,
    scenario: Scenario,
    paymentId: string,
    key: string,
  ): Result {
    const parsed = detectPaymentInput(text);
    const binding = JSON.stringify([
      paymentId,
      draft,
      parsed.ok ? [parsed.value.provider, parsed.value.identifier] : text,
    ]);
    const prior = attempts.get(key);
    if (prior)
      return prior.binding === binding
        ? { ...prior.result, replayed: true }
        : report('OPERATION_ERROR', 'IDEMPOTENCY_CONFLICT', 'idempotency');
    if (!parsed.ok) return report('INVALID_INPUT', parsed.error.code, 'input_parsing');
    if (parsed.value.provider !== draft.provider)
      return report('INVALID_INPUT', 'PROVIDER_MISMATCH', 'input_validation');

    const expected = createPaymentExpectation({
      tenantId: 'public-simulation',
      paymentId,
      provider: draft.provider,
      currency: 'ETB',
      amountMinor: parseEtbAmount(draft.amount),
      recipientName: draft.recipient,
      recipientAccountLast4: draft.account,
      reference: draft.reference,
      validFrom: Date.parse(draft.from + 'Z'),
      validUntil: Date.parse(draft.until + 'Z'),
      amountPolicy:
        draft.policy === 'tolerance'
          ? {
              mode: 'tolerance',
              underpayment: allowance(draft.underUnit, draft.under),
              overpayment: allowance(draft.overUnit, draft.over),
            }
          : { mode: 'exact' },
    });
    const finish = (result: Result) => {
      if (attempts.size >= 100) attempts.delete(attempts.keys().next().value!);
      attempts.set(key, { binding, result });
      return result;
    };
    if (scenario === 'missing')
      return finish(report('NOT_FOUND', 'RECEIPT_NOT_FOUND', 'receipt_retrieval'));
    if (scenario === 'timeout')
      return finish(report('UNAVAILABLE', 'PROVIDER_TIMEOUT', 'receipt_retrieval', [], true));
    if (scenario === 'unsupported')
      return finish(report('UNAVAILABLE', 'UNSUPPORTED_RECEIPT_FORMAT', 'receipt_parsing'));

    const actual: ReceiptEvidence = {
      provider: draft.provider,
      currency: 'ETB',
      transactionId: draft.provider === 'cbe' ? 'CBEDEMO42' : parsed.value.identifier,
      status: 'SUCCESSFUL',
      amountMinor: parseEtbAmount(
        scenario === 'over'
          ? '102.00'
          : ['under', 'accepted'].includes(scenario)
            ? '100.00'
            : scenario === 'rejected'
              ? '99.00'
              : sample.amount,
      ),
      recipientName: scenario === 'recipient' ? 'Other Merchant' : sample.recipient,
      recipientAccountLast4: sample.account,
      reference: scenario === 'invoice' ? 'INV-OTHER-1025' : sample.reference,
      transactionAt: sampleTime,
      paymentType: draft.provider === 'cbe' ? 'A2A' : null,
      ambiguousFields: [],
    };
    const compared = compareReceipt(
      expected,
      actual,
      draft.provider === 'telebirr' ? parsed.value.identifier : undefined,
    );
    if (compared.status !== 'MATCH') {
      return finish(
        report(
          compared.status === 'MISMATCH' ? 'MISMATCH' : 'UNAVAILABLE',
          compared.code,
          'comparison',
          compared.checks,
        ),
      );
    }
    const receiptKey = JSON.stringify([draft.provider, parsed.value.identifier]);
    const owner = claims.get(receiptKey);
    if (owner && owner !== paymentId)
      return finish(
        report('OPERATION_ERROR', 'RECEIPT_ALREADY_CLAIMED', 'completion', compared.checks),
      );
    if (claims.size >= 100) claims.delete(claims.keys().next().value!);
    claims.set(receiptKey, paymentId);
    return finish(report('VERIFIED', 'PAYMENT_VERIFIED', 'completion', compared.checks));
  }
  return { run };
}
