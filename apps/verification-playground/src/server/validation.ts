import {
  comparePaymentAmount,
  createPaymentExpectation,
  parseEtbAmount,
} from '@1hubengineering/verifier';
import type { AmountAllowance, AmountPolicy } from '@1hubengineering/verifier';
import { PAYMENT_INPUT_LIMIT } from '@1hubengineering/verifier/input';
import { z } from 'zod';
import type { AllowanceForm, Draft } from '../contracts.ts';
import { mockCases } from '../presets.ts';

export const providerSchema = z.enum(['telebirr', 'cbe']);
export const modeSchema = z.enum(['simulated', 'live']);
const allowanceSchema = z.strictObject({
  unit: z.enum(['fixed', 'percentage']),
  value: z.string().max(18),
});
export const draftSchema = z.strictObject({
  provider: providerSchema,
  amount: z.string().max(18),
  recipientName: z.string().trim().min(1).max(120),
  recipientAccountLast4: z.string().regex(/^\d{4}$/u),
  reference: z.string().trim().min(1).max(120),
  validFrom: z.iso.datetime({ offset: true }),
  validUntil: z.iso.datetime({ offset: true }),
  tolerance: z.boolean(),
  under: allowanceSchema,
  over: allowanceSchema,
});
export const saveDraftSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  draft: draftSchema,
});
export const registerSchema = z.strictObject({ mode: modeSchema, draft: draftSchema });
export const submissionSchema = z.strictObject({
  mode: modeSchema,
  paymentId: z.uuid(),
  attemptId: z.uuid(),
  evidence: z.string().max(PAYMENT_INPUT_LIMIT),
  inputProvider: z.enum(['auto', 'telebirr', 'cbe']),
  mockCase: z.enum(mockCases),
  showLiveValues: z.boolean().optional(),
});

function allowance(form: AllowanceForm): AmountAllowance {
  if (form.unit === 'percentage') return { type: 'percentage', percent: form.value };
  return {
    type: 'fixed',
    maxMinor: /^0(?:\.0{1,2})?$/u.test(form.value) ? 0 : parseEtbAmount(form.value),
  };
}

export function paymentExpectation(draft: Draft, tenantId: string, paymentId: string) {
  const amountPolicy: AmountPolicy = draft.tolerance
    ? {
        mode: 'tolerance',
        underpayment: allowance(draft.under),
        overpayment: allowance(draft.over),
      }
    : { mode: 'exact' };
  return createPaymentExpectation({
    tenantId,
    paymentId,
    provider: draft.provider,
    currency: 'ETB',
    amountMinor: parseEtbAmount(draft.amount),
    amountPolicy,
    recipientName: draft.recipientName,
    recipientAccountLast4: draft.recipientAccountLast4,
    reference: draft.reference,
    validFrom: Date.parse(draft.validFrom),
    validUntil: Date.parse(draft.validUntil),
  });
}

export function acceptedBounds(expectation: ReturnType<typeof paymentExpectation>) {
  const { minimumAcceptedMinor, maximumAcceptedMinor } = comparePaymentAmount(
    expectation.amountMinor,
    null,
    expectation.amountPolicy,
  ).details;
  return { minimumAcceptedMinor, maximumAcceptedMinor };
}
