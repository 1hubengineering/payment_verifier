import type { AmountCheckDetails } from './amount-policy.ts';
import type { DetectedPaymentInput, InputErrorCode } from './input.ts';
import type { JsonValue, ProviderId } from './types.ts';

export type CheckField =
  | 'provider'
  | 'transactionId'
  | 'paymentStatus'
  | 'amountMinor'
  | 'currency'
  | 'recipientName'
  | 'recipientAccount'
  | 'invoiceReference'
  | 'transactionTime'
  | 'paymentType';
export type MismatchCode =
  | 'RECEIPT_PROVIDER_MISMATCH'
  | 'TRANSACTION_ID_MISMATCH'
  | 'AMOUNT_UNDERPAID'
  | 'AMOUNT_OVERPAID'
  | 'CURRENCY_MISMATCH'
  | 'RECIPIENT_NAME_MISMATCH'
  | 'RECIPIENT_ACCOUNT_MISMATCH'
  | 'INVOICE_REFERENCE_MISMATCH'
  | 'PAYMENT_TIME_OUT_OF_RANGE'
  | 'PAYMENT_TYPE_MISMATCH'
  | 'PAYMENT_PENDING'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_REVERSED'
  | 'PAYMENT_CANCELLED';
export type IncompleteEvidenceCode =
  | 'REQUIRED_FIELD_MISSING'
  | 'INVALID_RECEIPT_FIELD'
  | 'AMBIGUOUS_RECEIPT_FIELD';

type CheckFinding =
  | { readonly status: 'PASS'; readonly required: true; readonly code: null }
  | { readonly status: 'SKIPPED'; readonly required: false; readonly code: 'CHECK_DISABLED' }
  | { readonly status: 'FAIL'; readonly required: true; readonly code: MismatchCode }
  | { readonly status: 'MISSING'; readonly required: true; readonly code: 'REQUIRED_FIELD_MISSING' }
  | { readonly status: 'INVALID'; readonly required: true; readonly code: 'INVALID_RECEIPT_FIELD' }
  | {
      readonly status: 'AMBIGUOUS';
      readonly required: true;
      readonly code: 'AMBIGUOUS_RECEIPT_FIELD';
    };

export type CheckStatus = CheckFinding['status'];
export type CheckRule =
  | 'exact'
  | 'within_tolerance'
  | 'normalized_name'
  | 'account_last4'
  | 'successful_status'
  | 'present_identifier'
  | 'time_window';
export type AmountCheck = Exclude<CheckFinding, { status: 'SKIPPED' }> & {
  readonly field: 'amountMinor';
  readonly rule: 'exact' | 'within_tolerance';
  readonly expected: number;
  readonly actual: number | null;
  readonly details: AmountCheckDetails;
};

export type VerificationCheck =
  | AmountCheck
  | (CheckFinding & {
      readonly field: Exclude<CheckField, 'amountMinor'>;
      readonly rule: CheckRule;
      readonly expected?: JsonValue;
      readonly actual?: JsonValue;
    });

export type ReceiptPaymentStatus = 'SUCCESSFUL' | 'PENDING' | 'FAILED' | 'REVERSED' | 'CANCELLED';
export interface ReceiptSnapshot {
  readonly provider: ProviderId | null;
  readonly transactionId: string | null;
  readonly paymentStatus: ReceiptPaymentStatus | null;
  readonly amountMinor: number | null;
  readonly currency: string | null;
  readonly recipientName: string | null;
  readonly recipientAccount: { readonly representation: 'LAST4'; readonly value: string } | null;
  readonly invoiceReference: string | null;
  readonly transactionAt: string | null;
  readonly paymentType: string | null;
}

export interface OfficialReceiptSource {
  readonly kind: 'OFFICIAL_RECEIPT';
  readonly retrievedAt: string;
  readonly parserVersion: string;
  readonly contentHash: string;
}

export const providerMessages = {
  PROVIDER_TIMEOUT: 'The official receipt request exceeded the configured timeout.',
  PROVIDER_RATE_LIMITED: 'The receipt provider rate limited the request.',
  PROVIDER_BUSY: 'The receipt provider adapter has reached its concurrency limit.',
  PROVIDER_HTTP_ERROR: 'The official receipt request returned an unexpected HTTP status.',
  PROVIDER_DNS_ERROR: 'The receipt hostname could not be resolved.',
  PROVIDER_TLS_ERROR: 'The secure connection to the receipt provider failed.',
  PROVIDER_NETWORK_ERROR: 'The connection to the receipt provider failed.',
  DESTINATION_BLOCKED: 'The receipt destination was blocked by network policy.',
  INVALID_PROVIDER_RESPONSE: 'The provider returned an invalid receipt response.',
  RECEIPT_TOO_LARGE: 'The receipt exceeded the configured size limit.',
  RECEIPT_RENDER_TIMEOUT: 'The receipt renderer exceeded the configured timeout.',
  UNSUPPORTED_RECEIPT_FORMAT: 'The official receipt uses an unsupported format.',
} as const;
export type ProviderFailureCode = keyof typeof providerMessages;
export type ProviderFailureStage = 'receipt_retrieval' | 'receipt_rendering' | 'receipt_parsing';
export type UnavailableCode =
  | ProviderFailureCode
  | IncompleteEvidenceCode
  | 'MULTIPLE_VERIFICATION_ISSUES';
export type DiagnosticDetails = Readonly<Record<string, JsonValue>>;

export interface VerificationResultBase {
  readonly verificationId: string | null;
  readonly tenantId: string;
  readonly paymentId: string;
  readonly expectedProvider: ProviderId;
  readonly input: DetectedPaymentInput | null;
  readonly message: string;
  readonly checks: readonly VerificationCheck[];
  readonly details: DiagnosticDetails;
  readonly receipt: ReceiptSnapshot | null;
  readonly source: OfficialReceiptSource | null;
}

export type InvalidInputResult = VerificationResultBase & {
  readonly verified: false;
  readonly status: 'INVALID_INPUT';
  readonly code: InputErrorCode | 'PROVIDER_MISMATCH';
  readonly stage: 'input_parsing' | 'input_validation';
  readonly retryable: false;
  readonly receipt: null;
  readonly source: null;
};

type ObservedResult = VerificationResultBase & {
  readonly verificationId: string;
  readonly input: DetectedPaymentInput;
};
export type VerificationResult =
  | (ObservedResult & {
      readonly verified: true;
      readonly status: 'VERIFIED';
      readonly code: 'PAYMENT_VERIFIED';
      readonly stage: 'completion';
      readonly retryable: false;
      readonly receipt: ReceiptSnapshot & {
        readonly provider: ProviderId;
        readonly transactionId: string;
        readonly paymentStatus: 'SUCCESSFUL';
        readonly amountMinor: number;
        readonly currency: 'ETB';
      };
      readonly source: OfficialReceiptSource;
    })
  | InvalidInputResult
  | (ObservedResult & {
      readonly verified: false;
      readonly status: 'MISMATCH';
      readonly code: MismatchCode | 'MULTIPLE_MISMATCHES';
      readonly stage: 'comparison';
      readonly retryable: boolean;
      readonly receipt: ReceiptSnapshot;
      readonly source: OfficialReceiptSource;
    })
  | (ObservedResult & {
      readonly verified: false;
      readonly status: 'NOT_FOUND';
      readonly code: 'RECEIPT_NOT_FOUND';
      readonly stage: 'receipt_retrieval';
      readonly retryable: boolean;
      readonly receipt: null;
      readonly source: null;
    })
  | (ObservedResult & {
      readonly verified: false;
      readonly status: 'UNAVAILABLE';
      readonly code: UnavailableCode;
      readonly stage: ProviderFailureStage | 'comparison';
      readonly retryable: boolean;
    });

export const operationMessages = {
  INVALID_REQUEST: 'The verification request is invalid.',
  INVALID_AMOUNT_POLICY:
    'The trusted amount matching policy is invalid or exceeds its allowed range.',
  INVALID_EXPECTATION: 'The trusted payment expectation is invalid.',
  EXPECTATION_NOT_FOUND: 'The local payment expectation was not found.',
  EXPECTATION_CONFLICT: 'This payment already has a different expectation.',
  EXPECTATION_CANCELLED: 'The merchant cancelled this payment expectation.',
  EXPECTATION_EXPIRED: 'The payment expectation expired.',
  EXPECTATION_NOT_YET_VALID: 'The payment expectation is not yet valid.',
  EXPECTATION_CHANGED: 'The payment expectation changed during verification.',
  IDEMPOTENCY_CONFLICT: 'The idempotency key is already bound to a different submission.',
  RECEIPT_ALREADY_CLAIMED: 'The receipt or payment already has a committed claim.',
  PROVIDER_NOT_CONFIGURED: 'The expected payment provider is not configured.',
  INVALID_ADAPTER_RESULT: 'The provider adapter returned an invalid outcome.',
  INVALID_PREPARATION: 'The prepared verification does not belong to this verifier.',
  OPERATION_CANCELLED: 'The caller cancelled the verification operation.',
  STORAGE_FAILURE: 'The storage operation failed before committing.',
  STORAGE_OUTCOME_UNKNOWN: 'The commit outcome is unknown. Recover using the original key.',
  CORRUPT_STATE: 'A stored verification record is invalid or incompatible.',
  INCOMPATIBLE_STORE: 'Archive the existing store and configure a new 0.2.0 store.',
  INTERNAL_ERROR: 'Verification encountered an unexpected internal error.',
  JOB_NOT_FOUND: 'The local verification job was not found.',
  JOB_IN_PROGRESS: 'The idempotency key belongs to a pending verification job.',
  QUEUE_CAPACITY: 'The verification queue reached its admission limit.',
  QUEUE_CONFIGURATION: 'The verification queue configuration is invalid or incompatible.',
  QUEUE_ATTEMPTS_EXHAUSTED:
    'The job exhausted its execution budget without a completed provider outcome.',
} as const;
export type OperationErrorCode = keyof typeof operationMessages;
export type OperationStage =
  | 'request'
  | 'expectation'
  | 'idempotency'
  | 'provider_configuration'
  | 'adapter'
  | 'completion'
  | 'storage'
  | 'queue';
export interface SerializedVerificationOperationError {
  readonly type: 'VERIFICATION_OPERATION_ERROR';
  readonly code: OperationErrorCode;
  readonly stage: OperationStage;
  readonly message: string;
  readonly retryable: boolean;
  readonly details: DiagnosticDetails;
}

export class VerificationOperationError extends Error {
  readonly code: OperationErrorCode;
  readonly stage: OperationStage;
  readonly retryable: boolean;
  readonly details: DiagnosticDetails;
  constructor(
    code: OperationErrorCode,
    stage: OperationStage,
    options: {
      readonly cause?: unknown;
      readonly retryable?: boolean;
      readonly details?: DiagnosticDetails;
    } = {},
  ) {
    super(operationMessages[code], { cause: options.cause });
    this.name = 'VerificationOperationError';
    this.code = code;
    this.stage = stage;
    this.retryable = options.retryable ?? false;
    this.details = options.details ?? {};
  }
  toJSON(): SerializedVerificationOperationError {
    return {
      type: 'VERIFICATION_OPERATION_ERROR',
      code: this.code,
      stage: this.stage,
      message: this.message,
      retryable: this.retryable,
      details: this.details,
    };
  }
}
