import type { EvidenceField, ReceiptEvidence } from '../comparison.ts';
import { parseEtbAmount } from '../money.ts';
import type { EtbMinorUnits } from '../money.ts';
import type { ProviderId } from '../types.ts';

export const RECEIPT_MAX_BYTES: number = 2_000_000;
export class UnsupportedReceiptHtml extends TypeError {}

export interface ParsedReceipt {
  readonly evidence: ReceiptEvidence;
  readonly recognized: boolean;
  readonly provenance: {
    readonly kind: 'SAVED_HTML';
    readonly provider: ProviderId;
    readonly parserVersion: '1';
  };
}

function clean(value: string): string {
  return value
    .replace(
      /&(?:#x([0-9a-f]+)|#([0-9]+)|(nbsp|amp|quot|apos|lt|gt));/giu,
      (
        whole: string,
        hex: string | undefined,
        dec: string | undefined,
        named: string | undefined,
      ) => {
        if (named)
          return (
            (
              { nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' } as Record<
                string,
                string
              >
            )[named.toLowerCase()] ?? whole
          );
        const code = Number.parseInt(hex ?? dec ?? '', hex ? 16 : 10);
        return code >= 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
          ? String.fromCodePoint(code)
          : '';
      },
    )
    .replace(/\s+/gu, ' ')
    .trim();
}
interface ReceiptLayout {
  tables: string[][][];
  spans: string[];
  text: string;
}
interface TableFrame {
  rows: string[][];
  row: { cells: string[]; containsTable: boolean } | undefined;
  cell: { tag: string; parts: string[]; length: number } | undefined;
}
/** Monotonic scanner for supported layouts and Telebirr's optional table end tags. */
function layout(html: string, provider: ProviderId): ReceiptLayout {
  // ASCII-only folding preserves offsets even for Unicode case expansions.
  const lower = html.replace(/[A-Z]/gu, (char) => char.toLowerCase());
  const spans: string[] = [],
    visible: string[] = [];
  let table: TableFrame = { rows: [], row: undefined, cell: undefined };
  const parents: TableFrame[] = [];
  const tables = [table.rows];
  let span: string[] | undefined;
  let spanLength = 0,
    tags = 0,
    cursor = 0;
  function invalid(): never {
    throw new UnsupportedReceiptHtml('Unsupported receipt HTML structure');
  }
  function finishCell(): void {
    if (!table.row || !table.cell || span) invalid();
    table.row.cells.push(clean(table.cell.parts.join('')));
    table.cell = undefined;
    if (table.row.cells.length > 128) invalid();
  }
  function finishRow(): void {
    if (!table.row || span) invalid();
    if (table.cell) {
      if (!parents.length) invalid();
      finishCell();
    }
    // Layout wrappers are neither receipt fields nor adjacent invoice rows.
    if (table.row.containsTable && table.row.cells.some((label) => field(label))) invalid();
    table.rows.push(table.row.containsTable ? [] : table.row.cells);
    table.row = undefined;
  }
  const append = (part: string): void => {
    visible.push(part);
    if (table.cell) {
      table.cell.length += part.length;
      if (table.cell.length > 8192) invalid();
      table.cell.parts.push(part);
    }
    if (span) {
      spanLength += part.length;
      if (spanLength > 8192) invalid();
      span.push(part);
    }
  };
  // Each invocation consumes a disjoint tag; quoted > characters are attributes.
  const tagEnd = (start: number): number => {
    let quote = '';
    let endOfQuotedValue = -1;
    const telebirrCell =
      provider === 'telebirr' &&
      lower.startsWith('<td', start) &&
      /\s/u.test(html[start + 3] ?? '');
    for (let i = start + 1; i < html.length && i - start <= 4096; i++) {
      const char = html[i]!;
      if (quote) {
        if (char === quote) {
          quote = '';
          endOfQuotedValue = i;
        }
      } else if (char === '"' || char === "'") {
        // The Telebirr layout includes a stray quote after a closed cell attribute.
        if (
          telebirrCell &&
          endOfQuotedValue >= 0 &&
          !html.slice(endOfQuotedValue + 1, i).trim() &&
          html[i + 1] === '>'
        )
          return i + 1;
        quote = char;
      } else if (char === '>') return i;
      else if (char === '<') return invalid();
    }
    return invalid();
  };
  while (cursor < html.length) {
    const open = html.indexOf('<', cursor);
    if (open === -1) {
      append(html.slice(cursor));
      cursor = html.length;
      break;
    }
    append(html.slice(cursor, open));
    if (++tags > 8192) invalid();
    if (html.startsWith('<!--', open)) {
      const end = html.indexOf('-->', open + 4);
      if (end === -1) invalid();
      cursor = end + 3;
      append(' ');
      continue;
    }
    const end = tagEnd(open);
    const token = lower.slice(open + 1, end);
    const match = /^(\/)?([a-z][a-z0-9-]*)(?=[\s/]|$)/u.exec(token);
    cursor = end + 1;
    if (!match) {
      if (!/^!doctype(?:\s|$)/u.test(token)) invalid();
      append(' ');
      continue;
    }
    const closing = Boolean(match[1]),
      name = match[2]!;
    if (closing && !/^\/[a-z][a-z0-9-]*\s*$/u.test(token)) invalid();
    if (['script', 'style', 'noscript', 'textarea', 'title', 'iframe', 'xmp'].includes(name)) {
      if (closing || /\/\s*$/u.test(token)) invalid();
      let close = cursor;
      for (;;) {
        close = lower.indexOf(`</${name}`, close);
        if (close === -1) invalid();
        const boundary = lower[close + name.length + 2];
        if (boundary === '>' || /\s/u.test(boundary ?? '')) break;
        close += name.length + 2;
      }
      const closeEnd = tagEnd(close);
      if (!new RegExp(`^/${name}\\s*$`, 'u').test(lower.slice(close + 1, closeEnd))) invalid();
      cursor = closeEnd + 1;
      append(' ');
      continue;
    }
    if (['tr', 'td', 'th', 'span'].includes(name) && /\/\s*$/u.test(token)) invalid();
    if (name === 'table' && provider === 'telebirr') {
      if (span || /\/\s*$/u.test(token)) invalid();
      if (closing) {
        if (!parents.length) invalid();
        if (table.row) finishRow();
        table = parents.pop()!;
      } else {
        if (parents.length >= 16) invalid();
        // A Telebirr footer table can sit in an empty presentation row.
        if (parents.length && !table.cell && table.row?.cells.length !== 0) invalid();
        if (table.row) table.row.containsTable = true;
        parents.push(table);
        table = { rows: [], row: undefined, cell: undefined };
        tables.push(table.rows);
      }
    } else if (parents.length && ['thead', 'tbody', 'tfoot'].includes(name)) {
      if (table.row) finishRow();
    } else if (name === 'tr') {
      if (closing) finishRow();
      else {
        if (span || (table.row && !parents.length)) invalid();
        if (table.row) finishRow();
        table.row = { cells: [], containsTable: false };
      }
    } else if (name === 'td' || name === 'th') {
      if (!table.row || span) invalid();
      if (closing) {
        if (table.cell?.tag !== name) invalid();
        finishCell();
      } else {
        if (table.cell) {
          if (!parents.length) invalid();
          finishCell();
        }
        table.cell = { tag: name, parts: [], length: 0 };
      }
    } else if (name === 'span') {
      if (closing) {
        if (!span) invalid();
        spans.push(clean(span.join('')));
        span = undefined;
      } else {
        if (span) invalid();
        span = [];
        spanLength = 0;
      }
    }
    append(' ');
  }
  if (table.row || table.cell || span || parents.length) invalid();
  return { tables, spans, text: clean(visible.join('')) };
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
const fields = new Map<string, EvidenceField>(
  (Object.keys(aliases) as EvidenceField[]).flatMap((f) => aliases[f]!.map((a) => [key(a), f])),
);
function field(label: string): EvidenceField | undefined {
  return fields.get(key(label));
}
function money(value: string): { amount: EtbMinorUnits | null; currency: string | null } {
  const m =
    /^(?:([A-Z]{3}|Birr) )?((?:0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d{1,2})?)(?: ([A-Z]{3}|Birr))?$/i.exec(
      value,
    );
  if (!m) return { amount: null, currency: null };
  const normalize = (code: string | undefined): string | undefined =>
    code?.toUpperCase() === 'BIRR' ? 'ETB' : code?.toUpperCase();
  const prefix = normalize(m[1]);
  const suffix = normalize(m[3]);
  const currency = prefix ?? suffix ?? null;
  if (prefix && suffix && prefix !== suffix) return { amount: null, currency: null };
  if (currency !== 'ETB') return { amount: null, currency };
  try {
    return { amount: parseEtbAmount(m[2]!.replaceAll(',', '')), currency: 'ETB' };
  } catch {
    return { amount: null, currency: 'ETB' };
  }
}

const telebirrFeeLabels = new Set([
  'stampduty',
  'discountamount',
  'servicefee',
  'servicefeevat',
  'totalpaidamount',
]);
function isTelebirrSummaryRow(row: string[]): boolean {
  if (row.length > 0 && row.every((value) => value === '')) return true;
  const label = row.length === 2 ? row[0] : row.length === 3 && row[0] === '' ? row[1] : undefined;
  return (
    label !== undefined &&
    telebirrFeeLabels.has(key(label)) &&
    money(row.at(-1)!).currency === 'ETB'
  );
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
export function parseReceiptHtml(provider: ProviderId, html: string): ParsedReceipt {
  if (
    (provider !== 'telebirr' && provider !== 'cbe') ||
    typeof html !== 'string' ||
    Buffer.byteLength(html) > RECEIPT_MAX_BYTES
  )
    throw new TypeError('Invalid or oversized receipt HTML');
  const { tables, spans, text } = layout(html, provider);
  const values = new Map<EvidenceField, string[]>();
  const add = (f: EvidenceField, value: string): void => {
    const list = values.get(f) ?? [];
    list.push(value);
    values.set(f, list);
  };
  for (const rows of tables) {
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
        // Multiple invoice rows in one table are ambiguous, never first-wins.
        for (let j = i + 1; j < rows.length; j++) {
          const next = rows[j]!;
          if (provider === 'telebirr' && isTelebirrSummaryRow(next)) continue;
          if (next.length !== row.length || next.some((v) => field(v) !== undefined)) break;
          headers.forEach((f, index) => {
            if (f) add(f, next[index] ?? '');
          });
        }
      }
    }
  }
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
    for (const found of text.matchAll(/\bStatus:\s*([A-Za-z]+)/gi)) add('status', found[1]!);
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
  const id = idRaw && /^[A-Z0-9_-]{6,40}$/i.test(idRaw) ? idRaw.toUpperCase() : null;
  const rawAmount = get('amountMinor');
  const parsedMoney = rawAmount ? money(rawAmount) : { amount: null, currency: null };
  const rawAccount = get('recipientAccountLast4');
  const account =
    rawAccount && /^(?:\d+[xX*•]{2,})?\d{4}$/.test(rawAccount) ? rawAccount.slice(-4) : null;
  const rawTime = get('transactionAt');
  const rawStatus = get('status');
  const transactionAt = rawTime ? parseProviderTime(rawTime) : null;
  const paymentStatus = rawStatus ? status(rawStatus) : null;
  const invalidFields: EvidenceField[] = [];
  if (idRaw && id === null) invalidFields.push('transactionId');
  if (rawAmount && parsedMoney.amount === null) invalidFields.push('amountMinor');
  if (rawAmount && parsedMoney.currency === null) invalidFields.push('currency');
  if (rawAccount && account === null) invalidFields.push('recipientAccountLast4');
  if (rawTime && transactionAt === null) invalidFields.push('transactionAt');
  if (rawStatus && paymentStatus === null) invalidFields.push('status');
  const evidence: ReceiptEvidence = Object.freeze({
    provider,
    currency: parsedMoney.currency,
    transactionId: id,
    status: paymentStatus,
    amountMinor: parsedMoney.amount,
    recipientName: get('recipientName'),
    recipientAccountLast4: account,
    reference: get('reference'),
    transactionAt,
    paymentType: get('paymentType'),
    ambiguousFields: Object.freeze(ambiguous),
    invalidFields: Object.freeze(invalidFields),
  });
  return Object.freeze({
    evidence,
    recognized:
      values.size >= 2 &&
      (values.has('transactionId') || values.has('amountMinor') || values.has('recipientName')),
    provenance: Object.freeze({ kind: 'SAVED_HTML', provider, parserVersion: '1' }),
  });
}
