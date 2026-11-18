export type ProviderId = 'telebirr' | 'cbe';

/** Receipt evidence states do not authorize fulfillment or wallet credits. */
export type VerificationStatus =
  | 'SUBMITTED'
  | 'QUEUED'
  | 'RUNNING'
  | 'RETRY_WAIT'
  | 'MATCHED_RECEIPT_ONLY'
  | 'MISMATCHED'
  | 'UNABLE_TO_VERIFY'
  | 'ALREADY_CLAIMED'
  | 'NEEDS_REVIEW'
  | 'EXPIRED'
  | 'CANCELLED';

/** Only a separately trusted settlement integration may advance this state. */
export type SettlementStatus = 'UNCONFIRMED' | 'SETTLEMENT_CONFIRMED' | 'CREDITED' | 'REVERSED';
