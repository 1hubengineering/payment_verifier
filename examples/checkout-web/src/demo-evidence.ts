import { parseEtbAmount } from '../../../packages/verifier/src/money.ts';
import { normalizeReceiptLocator } from '../../../packages/verifier/src/providers/locator.ts';
import type { ProviderId } from '../../../packages/verifier/src/types.ts';

export type EvidenceKind = 'transaction' | 'url' | 'sms';
export type { ProviderId };

export interface DemoEvidence {
  transactionId?: string;
  receiptUrl?: string;
  amountMinor?: number;
  feeMinor?: number;
  vatMinor?: number;
  recoveryMinor?: number;
  totalDebitedMinor?: number;
  senderAccount?: string;
  transactionAt?: number;
  sender?: string;
  recipient?: string;
  recipientAccount?: string;
  orderReference?: string;
}

const cbeReceiptNumber = /^v2-[a-z0-9_-]{1,512}$/i;
const cbeTransferNumber = /^[a-z0-9]{6,40}$/i;
const telebirrNumber = /^[a-z0-9]{6,32}$/i;

function transactionNumber(provider: ProviderId, input: string): string {
  if (provider === 'cbe' && cbeReceiptNumber.test(input)) return `v2-${input.slice(3)}`;
  if ((provider === 'cbe' ? cbeTransferNumber : telebirrNumber).test(input))
    return input.toUpperCase();
  throw new TypeError('Invalid transaction number');
}

function receiptUrl(provider: ProviderId, input: string): string {
  if (!/^https:\/\/[^\s<>"']+$/i.test(input)) throw new TypeError('Invalid receipt URL');
  const locator = normalizeReceiptLocator(provider, input);
  if (provider === 'cbe' && new URL(input).href !== locator.url)
    throw new TypeError('Invalid receipt URL');
  if (
    provider === 'telebirr' &&
    new URL(input).pathname.toUpperCase() !== new URL(locator.url).pathname.toUpperCase()
  ) {
    throw new TypeError('Invalid receipt URL');
  }
  return locator.url;
}

const fields = {
  telebirr: {
    transaction: 'Transaction (?:number|ID)',
    amount: '(?:Transferred )?Amount',
    date: '(?:Transaction )?Date',
    sender: 'From',
    recipient: 'To',
    account: 'Recipient (?:phone|mobile)',
    fee: '(?:Service )?Fee',
    reference: '(?:Order reference|Transfer note)',
  },
  cbe: {
    transaction: '(?:Transaction reference|Reference No\\.?)',
    amount: '(?:Transferred amount|Amount transferred)',
    date: '(?:Transfer date|Transaction date)',
    sender: 'Debited from',
    recipient: 'Credited to',
    account: '(?:Beneficiary account|Credited account)',
    fee: '(?:Service charge|Commission)',
    reference: '(?:Payment reference|Transfer description)',
  },
} as const;

function readField(sms: string, label: string): string | undefined {
  const matches = [
    ...sms.matchAll(new RegExp(`^[ \\t]*(?:${label})[ \\t]*[:=][ \\t]*([^\\r\\n]*)`, 'gim')),
  ];
  if (matches.length > 1 || (matches.length === 1 && !matches[0]?.[1]?.trim()))
    throw new TypeError('Ambiguous SMS field');
  return matches[0]?.[1]?.trim();
}

function money(amount: string): number {
  const match = /^(?:ETB\s+([\d,.]+)|([\d,.]+)\s+(?:ETB|Birr))$/i.exec(amount);
  const numeric = match?.[1] ?? match?.[2];
  if (!numeric || !/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(numeric))
    throw new TypeError('Invalid SMS amount');
  const normalized = numeric.replaceAll(',', '');
  return /^0(?:\.0{1,2})?$/.test(normalized) ? 0 : parseEtbAmount(normalized);
}

function timestamp(date: string): number {
  const dayFirst = /^(\d{2})\/(\d{2})\/(\d{4})( .+)$/.exec(date);
  if (dayFirst) date = `${dayFirst[3]}-${dayFirst[2]}-${dayFirst[1]}${dayFirst[4]}`;
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(:\d{2})?(?:\s*(Z|\+03:00|EAT))?$/i.exec(
    date,
  );
  if (!match) throw new TypeError('Invalid SMS date');
  const local = `${match[1]}T${match[2]}${match[3] ?? ':00'}`;
  const utc = match[4]?.toUpperCase() === 'Z';
  const time = Date.parse(local + (utc ? 'Z' : '+03:00'));
  if (
    !Number.isFinite(time) ||
    new Date(time + (utc ? 0 : 10_800_000)).toISOString().slice(0, 19) !== local
  ) {
    throw new TypeError('Invalid SMS date');
  }
  return time;
}

function phrase(sms: string, pattern: RegExp): string | undefined {
  const matches = [...sms.matchAll(pattern)];
  if (matches.length > 1) throw new TypeError('Ambiguous SMS field');
  return matches[0]?.[1]?.trim();
}

function singleField(labeled: string | undefined, phrased: string | undefined): string | undefined {
  if (labeled !== undefined && phrased !== undefined) throw new TypeError('Ambiguous SMS field');
  return labeled ?? phrased;
}

function transferFields(provider: ProviderId, sms: string) {
  const amount = phrase(
    sms,
    /\bYou have (?:successfully )?transferred\s+(ETB\s+[\d,.]+)\s+(?=to\s|from\s)/gi,
  );
  if (!amount) return undefined;
  const sender = phrase(sms, /^Dear[ \t]+([^\r\n]+?)(?=\s+You have |\r?$)/gim);
  if (provider === 'telebirr')
    return {
      amount,
      sender,
      senderAccount: undefined,
      recovery: undefined,
      total: undefined,
      transaction: phrase(sms, /\bYour transaction number is\s+([a-z0-9]+)(?=[.\s]|$)/gi),
      recipient: phrase(sms, /\btransferred\s+ETB\s+[\d,.]+\s+to\s+([^()\r\n]+)\s*\(/gi),
      account: phrase(
        sms,
        /\btransferred\s+ETB\s+[\d,.]+\s+to\s+[^()\r\n]+\(([^()\r\n]+)\)\s+on\s+/gi,
      ),
      date: phrase(sms, /\)\s+on\s+(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})(?=[.\s]|$)/gi),
      fee: phrase(sms, /\b(?<!VAT on )the service fee is\s+(ETB\s+[\d,.]+?)(?=[.,]?(?:\s|$))/gi),
      vat: phrase(sms, /\bVAT on the service fee is\s+(ETB\s+[\d,.]+?)(?=[.,]?(?:\s|$))/gi),
    };
  return {
    amount,
    sender,
    transaction: undefined,
    date: undefined,
    senderAccount: phrase(sms, /\bfrom account\s+([\d*X•]+)\s+to account\b/gi),
    account: phrase(sms, /\bto account\s+([\d*X•]+)\s+\(/gi),
    recipient: phrase(sms, /\bto account\s+[\d*X•]+\s+\(([^()\r\n]+)\)/gi),
    fee: phrase(sms, /\bService charge of\s+(ETB\s+[\d,.]+?)(?=[.,]?(?:\s|$))/gi),
    vat: phrase(sms, /\bVAT\s*\(\d+%\)\s+of\s+(ETB\s+[\d,.]+?)(?=[.,]?(?:\s|$))/gi),
    recovery: phrase(
      sms,
      /\bDisaster Recovery\s*\(\d+%\)\s+of\s+(?:ETB\s+)?([\d,.]+?)(?=[.,]?(?:\s|$))/gi,
    ),
    total: phrase(sms, /\btotal of\s+(ETB\s+[\d,.]+?)(?=[.,]?(?:\s|$))/gi),
  };
}

export function parseDemoEvidence(
  provider: ProviderId,
  kind: EvidenceKind,
  input: string,
): DemoEvidence {
  const value = input.trim();
  if (!value || input.length > 4096) throw new TypeError('Invalid evidence length');
  if (kind === 'transaction') return { transactionId: transactionNumber(provider, value) };
  if (kind === 'url') return { receiptUrl: receiptUrl(provider, value) };

  const other = provider === 'cbe' ? 'telebirr' : 'cbe';
  const brands = [
    /^(CBE|Telebirr)\b/i.exec(value)?.[1]?.toLowerCase(),
    /\bthanks for banking with (CBE)\b/i.exec(value)?.[1]?.toLowerCase(),
    /\bthank you for using (telebirr)\b/i.exec(value)?.[1]?.toLowerCase(),
  ];
  if (brands.includes(other)) throw new TypeError('Wrong SMS provider');
  const labels = fields[provider];
  const text = (field: keyof typeof labels) => readField(value, labels[field]);
  const prose = transferFields(provider, value);
  const transaction = singleField(text('transaction'), prose?.transaction);
  const amount = singleField(text('amount'), prose?.amount);
  const date = singleField(text('date'), prose?.date);
  const fee = singleField(text('fee'), prose?.fee);
  const sender = singleField(text('sender'), prose?.sender);
  const recipient = singleField(text('recipient'), prose?.recipient);
  const account = singleField(text('account'), prose?.account);
  const order = text('reference');
  const links = (value.match(/https?:\/\/[^\s<>"']+/gi) ?? [])
    .map((link) => link.replace(/[.,;)]+$/u, ''))
    .filter(
      (link) => !(provider === 'cbe' && /^https:\/\/forms\.gle\/kGNGQpG3mQCCk3iD6\/?$/.test(link)),
    );
  if (links.length > 1) throw new TypeError('Ambiguous SMS links');
  const link = links[0] ? receiptUrl(provider, links[0]) : undefined;
  const id = transaction ? transactionNumber(provider, transaction) : undefined;
  if (
    provider === 'telebirr' &&
    link &&
    id &&
    normalizeReceiptLocator(provider, link).transactionId !== id
  ) {
    throw new TypeError('Conflicting SMS reference');
  }
  if (
    provider === 'cbe' &&
    link &&
    id?.startsWith('v2-') &&
    new URL(link).pathname.slice(1) !== id
  ) {
    throw new TypeError('Conflicting SMS reference');
  }
  return {
    ...(id === undefined ? {} : { transactionId: id }),
    ...(link === undefined ? {} : { receiptUrl: link }),
    ...(amount === undefined ? {} : { amountMinor: money(amount) }),
    ...(fee === undefined ? {} : { feeMinor: money(fee) }),
    ...(prose?.vat === undefined ? {} : { vatMinor: money(prose.vat) }),
    ...(prose?.recovery === undefined ? {} : { recoveryMinor: money(`ETB ${prose.recovery}`) }),
    ...(prose?.total === undefined ? {} : { totalDebitedMinor: money(prose.total) }),
    ...(prose?.senderAccount === undefined ? {} : { senderAccount: prose.senderAccount }),
    ...(date === undefined ? {} : { transactionAt: timestamp(date) }),
    ...(sender === undefined ? {} : { sender }),
    ...(recipient === undefined ? {} : { recipient }),
    ...(account === undefined ? {} : { recipientAccount: account }),
    ...(order === undefined ? {} : { orderReference: order }),
  };
}
