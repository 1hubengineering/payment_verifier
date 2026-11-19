export type ProviderId = 'telebirr' | 'cbe';

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type VerificationStatus =
  | 'VERIFIED'
  | 'MISMATCH'
  | 'NOT_FOUND'
  | 'UNAVAILABLE'
  | 'INVALID_INPUT';
