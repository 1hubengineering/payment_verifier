// This entrypoint is safe to bundle for browsers. It performs no provider I/O.
export { comparePaymentAmount } from './amount-policy.ts';
export type { AmountPolicy, AmountAllowance, AmountCheckDetails } from './amount-policy.ts';
export { parseEtbAmount } from './money.ts';
export type { EtbMinorUnits } from './money.ts';
export { createPaymentExpectation, compareReceipt } from './comparison.ts';
export type { PaymentExpectation, ReceiptEvidence, ReceiptComparison } from './comparison.ts';
export type { VerificationCheck } from './outcomes.ts';
export type { ProviderId } from './types.ts';
