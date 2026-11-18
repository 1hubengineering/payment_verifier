import type { EvidenceField, ReceiptEvidence } from '../comparison.ts';
import { parseEtbAmount } from '../money.ts';
import type { EtbMinorUnits } from '../money.ts';
import type { ProviderId } from '../types.ts';

export const RECEIPT_MAX_BYTES: number = 2_000_000;
export interface ParsedReceipt {
  readonly evidence: ReceiptEvidence;
  readonly provenance: {
    readonly kind: 'SAVED_HTML';
    readonly provider: ProviderId;
    readonly parserVersion: '1';
  };
}

function clean(value: string): string {
  return value
    .replace(/<[^>]*>/gu, ' ')
    .replace(/&(?:nbsp|#160);/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&quot;/giu, '"')
    .replace(/&apos;/giu, "'")
    .replace(
      /&#(?:x([0-9a-f]+)|([0-9]+));/giu,
      (_whole: string, hex: string | undefined, dec: string | undefined) => {
        const code = Number.parseInt(hex ?? dec ?? '', hex ? 16 : 10);
        return code >= 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
          ? String.fromCodePoint(code)
          : '';
      },
    )
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/\s+/gu, ' ')
    .trim();
}
function key(value: string): string {
  return value
    .replace(/^[^A-Za-z]+/u, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/gu, '');
}

/** Supported provider layouts use Ethiopian local time (UTC+03:00). */
export function parseProviderTime(value: string): number | null {
  const dmy = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4}) (\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  const ymd = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  const english = /^([A-Za-z]{3}) (\d{1,2}), (\d{4}), (\d{1,2}):(\d{2}) (AM|PM)$/i.exec(value);
  const iso = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(Z|[+-]\d{2}:\d{2})$/.exec(value);
  let year: number, month: number, day: number, hour: number, minute: number, second: number;
  let offset = 180;
  if (dmy) {
    [year, month, day, hour, minute, second] = [
      Number(dmy[3]),
      Number(dmy[2]),
      Number(dmy[1]),
      Number(dmy[4]),
      Number(dmy[5]),
      Number(dmy[6] ?? 0),
    ];
  } else if (ymd || iso) {
    const m = (ymd ?? iso)!;
    [year, month, day, hour, minute, second] = [
      Number(m[1]),
      Number(m[2]),
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6] ?? 0),
    ];
    if (iso) {
      const zone = iso[7]!;
      const hours = Number(zone.slice(1, 3)),
        minutes = Number(zone.slice(4, 6));
      if (zone !== 'Z' && (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)))
        return null;
      offset = zone === 'Z' ? 0 : (zone[0] === '-' ? -1 : 1) * (hours * 60 + minutes);
    }
  } else if (english) {
    const months = [
      'jan',
      'feb',
      'mar',
      'apr',
      'may',
      'jun',
      'jul',
      'aug',
      'sep',
      'oct',
      'nov',
      'dec',
    ];
    const rawHour = Number(english[4]);
    if (rawHour < 1 || rawHour > 12) return null;
    [year, month, day, hour, minute, second] = [
      Number(english[3]),
      months.indexOf(english[1]!.toLowerCase()) + 1,
      Number(english[2]),
      (rawHour % 12) + (english[6]!.toUpperCase() === 'PM' ? 12 : 0),
      Number(english[5]),
      0,
    ];
  } else return null;
  if (
    year < 1970 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  )
    return null;
  const local = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    local.getUTCFullYear() !== year ||
    local.getUTCMonth() !== month - 1 ||
    local.getUTCDate() !== day
  )
    return null;
  const utc = local.getTime() - offset * 60_000;
  return utc >= 0 ? utc : null;
}

const aliases: Readonly<Partial<Record<EvidenceField, readonly string[]>>> = {
  transactionId: [
    'Receipt No.',
    'Receipt Number',
    'Invoice Number',
    'Invoice No.',
    'Invoice',
    'Transaction Number',
    'Transaction ID',
    'Transaction Reference',
    'Reference Number',
    'Reference No. (VAT Invoice No)',
  ],
  status: ['Transaction Status', 'Payment Status', 'Status'],
  amountMinor: ['Settled Amount', 'Transferred Amount', 'Amount Paid', 'Amount'],
  recipientName: [
    'Credited Party name',
    'Recipient Name',
    'Receiver Name',
    'Recipient',
    'Receiver',
  ],
  recipientAccountLast4: [
    'Credited party account no',
    'Recipient Account',
    'Receiver Account',
    'Recipient Phone',
    'Receiver Phone',
    'To Account',
  ],
  reference: [
    'Customer Note',
    'Payment Note',
    'Transaction Remark',
    'Remark',
    'Note',
    'Reason / Type of service',
  ],
  transactionAt: ['Payment date', 'Transaction date', 'Date & Time', 'Date', 'Payment Date & Time'],
  paymentType: ['Payment Type'],
};
function field(label: string): EvidenceField | undefined {
  return (Object.keys(aliases) as EvidenceField[]).find((f) =>
    aliases[f]!.some((a) => key(a) === key(label)),
  );
}
function money(value: string): { amount: EtbMinorUnits | null; currency: string | null } {
  const m =
    /^(?:(ETB|Birr) )?((?:0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d{1,2})?)(?: (ETB|Birr))?$/i.exec(
      value,
    );
  if (!m || (!m[1] && !m[3]) || (m[1] && m[3] && m[1].toLowerCase() !== m[3].toLowerCase()))
    return { amount: null, currency: null };
  try {
    return { amount: parseEtbAmount(m[2]!.replaceAll(',', '')), currency: 'ETB' };
  } catch {
    return { amount: null, currency: 'ETB' };
  }
}
function status(value: string): ReceiptEvidence['status'] {
  const normalized = value.toUpperCase();
  if (['COMPLETED', 'SUCCESSFUL', 'SUCCESS'].includes(normalized)) return 'SUCCESSFUL';
  if (
    normalized === 'PENDING' ||
    normalized === 'FAILED' ||
    normalized === 'REVERSED' ||
    normalized === 'CANCELLED'
  )
    return normalized;
  return null;
}

/** Offline extraction only; saved HTML cannot establish provider authenticity. */
export function parseReceiptHtml(
  provider: ProviderId,
  html: string,
  expectedTransactionId?: string,
): ParsedReceipt {
  if (
    (provider !== 'telebirr' && provider !== 'cbe') ||
    typeof html !== 'string' ||
    Buffer.byteLength(html) > RECEIPT_MAX_BYTES
  )
    throw new TypeError('Invalid or oversized receipt HTML');
  if (expectedTransactionId !== undefined && !/^[A-Z0-9]{6,32}$/.test(expectedTransactionId))
    throw new TypeError('Invalid expected transaction ID');
  const stripped = html
    .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/gu, ' ');
  const rows = [...stripped.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)].map((row) =>
    [...row[1]!.matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)].map((cell) => clean(cell[2]!)),
  );
  const values = new Map<EvidenceField, string[]>();
  const add = (f: EvidenceField, value: string): void => {
    const list = values.get(f) ?? [];
    list.push(value);
    values.set(f, list);
  };
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.length === 2) {
      const f = field(row[0]!);
      if (f) add(f, row[1]!);
    }
    const headers = row.map(field);
    if (
      headers.includes('transactionId') &&
      headers.includes('transactionAt') &&
      headers.includes('amountMinor')
    ) {
      // Read all contiguous value rows; multiple receipts are ambiguous, never first-wins.
      for (const next of rows.slice(i + 1)) {
        if (next.length !== row.length || next.some((v) => field(v) !== undefined)) break;
        headers.forEach((f, index) => {
          if (f) add(f, next[index] ?? '');
        });
      }
    }
  }
  const spans = [...stripped.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span\s*>/gi)].map((m) =>
    clean(m[1]!),
  );
  let receiver = false;
  for (let i = 0; i + 1 < spans.length; i++) {
    const label = spans[i]!,
      value = spans[i + 1]!;
    const f = field(label);
    if (f) {
      add(f, value);
      if (f === 'recipientName') receiver = true;
      i++;
    } else if (provider === 'cbe' && key(label) === 'account' && receiver) {
      add('recipientAccountLast4', value);
      i++;
    }
  }
  if (provider === 'cbe') {
    for (const found of clean(stripped).matchAll(/\bStatus:\s*([A-Za-z]+)/gi))
      add('status', found[1]!);
  }
  const ambiguous: EvidenceField[] = [];
  const get = (f: EvidenceField): string | null => {
    const candidates = [...new Set(values.get(f) ?? [])];
    if (candidates.length > 1) {
      ambiguous.push(f);
      return null;
    }
    return candidates[0] || null;
  };
  const idRaw = get('transactionId');
  let id = idRaw && /^[A-Z0-9_-]{6,40}$/i.test(idRaw) ? idRaw.toUpperCase() : null;
  if (expectedTransactionId && id !== expectedTransactionId) {
    if (!ambiguous.includes('transactionId')) ambiguous.push('transactionId');
    id = null;
  }
  const rawAmount = get('amountMinor');
  const parsedMoney = rawAmount ? money(rawAmount) : { amount: null, currency: null };
  const rawAccount = get('recipientAccountLast4');
  const account =
    rawAccount && /^(?:\d+[xX*•]{2,})?\d{4}$/.test(rawAccount) ? rawAccount.slice(-4) : null;
  const rawTime = get('transactionAt');
  const rawStatus = get('status');
  const evidence: ReceiptEvidence = Object.freeze({
    provider,
    currency: parsedMoney.currency,
    transactionId: id,
    status: rawStatus ? status(rawStatus) : null,
    amountMinor: parsedMoney.amount,
    recipientName: get('recipientName'),
    recipientAccountLast4: account,
    reference: get('reference'),
    transactionAt: rawTime ? parseProviderTime(rawTime) : null,
    paymentType: get('paymentType'),
    ambiguousFields: Object.freeze(ambiguous),
  });
  return Object.freeze({
    evidence,
    provenance: Object.freeze({ kind: 'SAVED_HTML', provider, parserVersion: '1' }),
  });
}
