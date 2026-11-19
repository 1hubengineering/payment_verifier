import { createHash } from 'node:crypto';
import { parseEtbAmount } from '@1hubengineering/verifier';
import type { EtbMinorUnits, EvidenceField, ReceiptEvidence } from '@1hubengineering/verifier';
import { parseProviderTime } from '@1hubengineering/verifier/providers';
import type { ProviderResult, ReceiptLocator } from '@1hubengineering/verifier/providers';

export const cbeDataHost = 'mb.cbe.com.et';

export function isClientReceipt(html: string): boolean {
  return (
    html.includes('window.__NUXT__') &&
    /<script\b[^>]{0,1024}\bsrc\s*=\s*["']\/_nuxt\/[A-Za-z0-9_-]{3,64}\.js["']/i.test(html)
  );
}

function field(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 256) return null;
  const text = value.trim();
  return text && !/^(?:n\/a|null|undefined|-+)$/i.test(text) ? text : null;
}

const statuses = new Map<string, ReceiptEvidence['status']>([
  ['COMPLETED', 'SUCCESSFUL'],
  ['FAILED', 'FAILED'],
  ['PENDING', 'PENDING'],
  ['REVERSED', 'REVERSED'],
  ['CANCELLED', 'CANCELLED'],
]);

function transactionTime(value: unknown): number | null {
  const raw = Array.isArray(value) ? field(value[0]) : null;
  if (!raw) return null;
  const fraction = /\.(\d{1,3})(?=(?:Z|[+-]\d{2}:\d{2})?$)/u.exec(raw);
  if (!fraction) return parseProviderTime(raw);
  const seconds = parseProviderTime(raw.replace(fraction[0], ''));
  return seconds === null ? null : seconds + Number(fraction[1]!.padEnd(3, '0'));
}

const unsupported = (): ProviderResult => ({
  kind: 'UNAVAILABLE',
  code: 'UNSUPPORTED_RECEIPT_FORMAT',
  stage: 'receipt_parsing',
  retryable: false,
  details: {},
});

export function interpretCbeData(
  locator: ReceiptLocator,
  json: string,
  retrievedAt: number,
): ProviderResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return unsupported();
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return unsupported();
  const value = parsed as Record<string, unknown>;
  if (!Object.hasOwn(value, 'id') || !Object.hasOwn(value, 'platformTransactionType'))
    return unsupported();

  const id = field(value.id);
  const currency = field(value.creditCurrency)?.toUpperCase() ?? null;
  const credited = field(value.amountCredited);
  let amountMinor: EtbMinorUnits | null = null;
  if (currency === 'ETB' && credited) {
    try {
      amountMinor = parseEtbAmount(credited);
    } catch {
      // The comparison reports invalid monetary evidence.
    }
  }
  const account = field(value.creditAccountNo);
  const invalidFields: EvidenceField[] = [];
  if (credited && !amountMinor && currency === 'ETB') invalidFields.push('amountMinor');
  const status = statuses.get(field(value.status)?.toUpperCase() ?? '') ?? null;
  const thirdPartyStatus = field(value.thirdPartyStatus)?.toUpperCase();
  const conflictingStatus =
    status === 'SUCCESSFUL' &&
    (field(value.statusDesc)?.toUpperCase() === 'FAILURE' ||
      (thirdPartyStatus !== undefined && thirdPartyStatus !== 'SUCCESS'));
  const evidence: ReceiptEvidence = {
    provider: 'cbe',
    currency,
    transactionId: id && /^[A-Z0-9_-]{6,40}$/i.test(id) ? id.toUpperCase() : null,
    status,
    amountMinor,
    recipientName: field(value.creditAccountHolder),
    recipientAccountLast4:
      account && /^(?:\d+(?:[xX*•]{2,})?)?\d{4}$/u.test(account) ? account.slice(-4) : null,
    reference: field(value.description) ?? field(value.notes),
    transactionAt: transactionTime(value.dateTimes),
    paymentType:
      value.isOtherBank === true
        ? 'OTHER_BANK'
        : (field(value.platformTransactionType)?.toUpperCase() ?? null),
    ambiguousFields: conflictingStatus ? ['status'] : [],
    invalidFields,
  };
  return {
    kind: 'EVIDENCE',
    evidence,
    provenance: {
      kind: 'OFFICIAL_HTTPS',
      url: locator.url,
      retrievedAt,
      sha256: createHash('sha256').update(json).digest('hex'),
      parserVersion: 'cbe-json-1',
    },
  };
}
