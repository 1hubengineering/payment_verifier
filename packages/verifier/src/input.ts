import { cbeIdentifier, receiptEndpoints, telebirrIdentifier } from './input-syntax.ts';
import type { JsonValue, ProviderId } from './types.ts';

export const PAYMENT_INPUT_LIMIT = 4096;
export type InputType = 'identifier' | 'receipt_url' | 'sms';
export type DetectedPaymentInput =
  | {
      readonly provider: 'telebirr';
      readonly inputType: InputType;
      readonly identifierKind: 'transaction_id';
      readonly identifier: string;
    }
  | {
      readonly provider: 'cbe';
      readonly inputType: InputType;
      readonly identifierKind: 'receipt_id';
      readonly identifier: string;
    };

const messages = {
  EMPTY_INPUT: 'Enter a payment reference, receipt link, or message.',
  INPUT_TOO_LONG: 'The payment input exceeds the maximum length.',
  UNRECOGNIZED_INPUT: 'No supported payment identifier was found.',
  INVALID_IDENTIFIER: 'The payment identifier has an unsupported format.',
  AMBIGUOUS_INPUT: 'The input contains conflicting payment identifiers.',
  UNSUPPORTED_RECEIPT_URL: 'The receipt URL has an unsupported host or path.',
} as const;

export type InputErrorCode = keyof typeof messages;
export type InputDetectionResult =
  | { readonly ok: true; readonly value: DetectedPaymentInput }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: InputErrorCode;
        readonly message: string;
        readonly details: Readonly<Record<string, JsonValue>>;
      };
    };

function failure(code: InputErrorCode): InputDetectionResult {
  return {
    ok: false,
    error: {
      code,
      message: messages[code],
      details: code === 'INPUT_TOO_LONG' ? { maxLength: PAYMENT_INPUT_LIMIT } : {},
    },
  };
}

function candidate(
  provider: ProviderId,
  inputType: InputType,
  identifier: string,
): DetectedPaymentInput {
  return provider === 'cbe'
    ? { provider, identifierKind: 'receipt_id', inputType, identifier }
    : {
        provider,
        identifierKind: 'transaction_id',
        inputType,
        identifier: identifier.toUpperCase(),
      };
}

function fromUrl(url: string, inputType: InputType): DetectedPaymentInput | undefined {
  const lower = url.toLowerCase();
  for (const provider of ['telebirr', 'cbe'] as const) {
    const endpoint = receiptEndpoints[provider];
    if (!lower.startsWith(endpoint)) continue;
    // The scheme and hostname are case-insensitive. Receipt path casing is meaningful.
    if (provider === 'telebirr' && !url.slice(0, endpoint.length).endsWith('/receipt/')) continue;
    const identifier = url.slice(endpoint.length);
    if ((provider === 'cbe' ? cbeIdentifier : telebirrIdentifier).test(identifier))
      return candidate(provider, inputType, identifier);
  }
  return undefined;
}

/** Extract a lookup identifier. This function has no I/O or provider configuration. */
export function detectPaymentInput(input: string): InputDetectionResult {
  if (typeof input !== 'string') return failure('UNRECOGNIZED_INPUT');
  if (input.length > PAYMENT_INPUT_LIMIT) return failure('INPUT_TOO_LONG');
  const value = input
    .trim()
    .replace(/^[([{"'“‘<]+/u, '')
    .replace(/[)\]}"'”’>.,;!]+$/u, '')
    .trim();
  if (!value) return failure('EMPTY_INPUT');
  if (cbeIdentifier.test(value)) return { ok: true, value: candidate('cbe', 'identifier', value) };
  if (telebirrIdentifier.test(value))
    return { ok: true, value: candidate('telebirr', 'identifier', value) };
  if (/^(?:[a-z][a-z0-9+.-]*:\/\/|www\.)\S+$/iu.test(value)) {
    const detected = fromUrl(value, 'receipt_url');
    return detected ? { ok: true, value: detected } : failure('UNSUPPORTED_RECEIPT_URL');
  }

  const candidates = new Map<string, DetectedPaymentInput>();
  const add = (found: DetectedPaymentInput): void => {
    candidates.set(found.provider + ':' + found.identifier, found);
  };
  let invalid = false;
  let unsupportedUrl = false;
  const message = value.replace(/\b(?:[a-z][a-z0-9+.-]*:\/\/|www\.)[^\s<>"'“”]+/giu, (url) => {
    const clean = url
      .replace(/(\/receipt\/[a-z0-9]{6,32})\.(?=Thank\b).*$/i, '$1')
      .replace(/[.,;!)\]}]+$/u, '');
    const found = fromUrl(clean, 'sms');
    if (found) add(found);
    else if (
      /^https?:\/\/(?:transactioninfo\.ethiotelecom\.et(?::\d+)?\/receipt(?:[/?#]|$)|mbreciept\.cbe\.com\.et(?::\d+)?\/v2-)/i.test(
        clean,
      )
    )
      unsupportedUrl = true;
    return '\u0000';
  });
  for (const match of message.matchAll(/(?<![a-z0-9_-])v2-[a-z0-9_-]*(?![a-z0-9_-])/gi)) {
    const identifier = match[0];
    if (cbeIdentifier.test(identifier)) add(candidate('cbe', 'sms', identifier));
    else invalid = true;
  }
  for (const match of message.matchAll(
    /\btransaction\s+(?:number|no\.?|id|reference)\b\.?\s*(?:is\s+|[:#-]\s*)?[(["']?([a-z0-9_-]+)/gi,
  )) {
    const identifier = match[1]!;
    if (telebirrIdentifier.test(identifier)) add(candidate('telebirr', 'sms', identifier));
    else if (!cbeIdentifier.test(identifier)) invalid = true;
  }
  if (candidates.size > 1) return failure('AMBIGUOUS_INPUT');
  if (unsupportedUrl) return failure('UNSUPPORTED_RECEIPT_URL');
  if (invalid) return failure('INVALID_IDENTIFIER');
  const detected = candidates.values().next().value;
  if (detected) return { ok: true, value: detected };
  return failure(/^v2-|^[a-z0-9_-]+$/i.test(value) ? 'INVALID_IDENTIFIER' : 'UNRECOGNIZED_INPUT');
}
