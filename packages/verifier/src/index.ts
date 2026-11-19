export { comparePaymentAmount } from './amount-policy.ts';
export type { AmountPolicy, AmountAllowance, AmountCheckDetails } from './amount-policy.ts';
export { parseEtbAmount } from './money.ts';
export type { EtbMinorUnits } from './money.ts';
export type { JsonValue, ProviderId, VerificationStatus } from './types.ts';
export { createPaymentExpectation, compareReceipt } from './comparison.ts';
export type {
  PaymentExpectation,
  ReceiptEvidence,
  ReceiptComparison,
  EvidenceField,
} from './comparison.ts';
export { StorageConflict } from './storage.ts';
export type { RecordTransaction, StoredRecord, VerificationStorage } from './storage.ts';
export { VerificationOperationError } from './outcomes.ts';
export type {
  VerificationResult,
  InvalidInputResult,
  CheckField,
  CheckStatus,
  CheckRule,
  VerificationCheck,
  AmountCheck,
  MismatchCode,
  IncompleteEvidenceCode,
  UnavailableCode,
  ProviderFailureCode,
  ProviderFailureStage,
  ReceiptPaymentStatus,
  ReceiptSnapshot,
  OfficialReceiptSource,
  DiagnosticDetails,
  OperationErrorCode,
  OperationStage,
  SerializedVerificationOperationError,
} from './outcomes.ts';
export { createReceiptVerifier, storageKey } from './verifier.ts';
export type {
  PaymentScope,
  VerificationSubmission,
  ReceiptProvider,
  PreparedVerification,
  ReceiptVerifier,
} from './verifier.ts';
