import {extractV5Telebirr,fetchTelebirrV5} from './telebirr-v5.ts';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';

export type Provider = 'telebirr' | 'cbe';
export type Order = {
  merchantId: string;
  orderId: string;
  provider: Provider;
  amount: number;
  recipientName: string;
  recipientAccountLast4: string;
  reference: string;
  createdAt?: string;
  expiresAt?: string;
};
export type Receipt = {
  provider: Provider;
  transactionId: string | null;
  status: string | null;
  amount: number | null;
  recipientName: string | null;
  recipientAccountLast4: string | null;
  note: string | null;
  transactionAt: string | null;
  sourceUrl?: string;
  paymentType?: string | null;
};
export type Outcome = 'MATCH' | 'ALREADY_USED' | 'ORDER_ALREADY_CLAIMED' | 'MISMATCH' | 'UNABLE_TO_VERIFY';
export type Comparison = { outcome: Outcome; checks: Record<string,'PASS'|'FAIL'|'MISSING'> };

export function validateOrder(v: any): Order {
  if (!v || typeof v !== 'object') throw new Error('Expected a JSON order object');
  const required = ['merchantId','orderId','provider','recipientName','recipientAccountLast4','reference'];
  for (const key of required) if (typeof v[key] !== 'string' || !v[key].trim()) throw new Error(`Invalid order.${key}`);
  if (!['cbe','telebirr'].includes(v.provider)) throw new Error('order.provider must be cbe or telebirr');
  if (!Number.isFinite(v.amount) || v.amount <= 0 || Math.round(v.amount*100) !== v.amount*100) throw new Error('order.amount must be a positive ETB value with at most two decimals');
  if (!/^\d{4}$/.test(v.recipientAccountLast4)) throw new Error('order.recipientAccountLast4 must be four digits');
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/.test(v.reference) || !/[A-Za-z]/.test(v.reference) || !/\d/.test(v.reference)) throw new Error('order.reference must be a unique 8–64 character alphanumeric token (with letters and digits; - or _ allowed)');
  for (const key of ['createdAt','expiresAt']) if (v[key] !== undefined && (!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(v[key]) || Number.isNaN(Date.parse(v[key])))) throw new Error(`order.${key} must be ISO-8601 with timezone`);
  if (v.createdAt && v.expiresAt && Date.parse(v.expiresAt) < Date.parse(v.createdAt)) throw new Error('Order expiration precedes creation');
  return v as Order;
}

function unescapeHtml(s: string): string {
  return s.replace(/&(?:nbsp|amp|lt|gt|quot|apos|#39|#x27);/gi, (s) => ({'&nbsp;':' ','&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&#39;':"'",'&#x27;':"'"}[s.toLowerCase()] ?? s));
}
function clean(s: string): string { return unescapeHtml(s.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim(); }
function htmlText(html: string): string {
  return clean(html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<\/(?:p|div|tr|td|span|li|h\d)>/gi, '\n'));
}
function toMoney(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = text.replace(/,/g,'').match(/\b\d+(?:\.\d{1,2})?\b/);
  return match ? Number(match[0]) : null;
}
function last4(s: string | null | undefined): string | null { const m = s?.replace(/\s/g,'').match(/(\d{4})$/); return m ? m[1] : null; }
function normalizedName(s: string): string { return s.trim().replace(/\s+/g,' ').toLocaleLowerCase('en-US'); }
function cbeTimestamp(s: string | null): string | null {
  if (!s) return null;
  // CBE's sample displays local Ethiopian time, EAT (UTC+03:00).
  const m = s.match(/^([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4}),\s*(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const mon = months.indexOf(m[1].toLowerCase()); if (mon < 0) return null;
  const hour = Number(m[4]) % 12 + (m[6].toUpperCase() === 'PM' ? 12 : 0);
  const utc = new Date(Date.UTC(Number(m[3]),mon,Number(m[2]),hour - 3,Number(m[5])));
  if (Number.isNaN(utc.getTime())) return null;
  return utc.toISOString();
}

/** Reads the label/value spans from CBE's rendered official customer receipt. */
export function parseCbeHtml(html: string): Receipt {
  const start = html.indexOf('Payment / Transaction Informations');
  const stop = start >= 0 ? html.indexOf('Amount in Word:',start) : -1;
  const region = start >= 0 ? html.slice(start,stop > start ? stop : undefined) : html;
  const spans = [...region.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/gi)].map(m => clean(m[1])).filter(Boolean);
  const fields = new Map<string,string[]>();
  for(let i=0; i < spans.length-1; i++) {
    const k = spans[i];
    if (/^(Payer:|Receiver:|Account:|Payment Type:|Payment Date & Time:|Reference No\. \(VAT Invoice No\):|Reason \/ Type of service:|Transferred Amount:|Service Charge:|VAT \(15% of service charge\):|Disaster Risk Response Fund \(5% of service charge\):|Total amount debited from customer's account:)$/i.test(k)) {
      fields.set(k.toLowerCase(),[...(fields.get(k.toLowerCase())??[]),spans[i+1]]);
      i++;
    }
  }
  const get=(key:string)=>fields.get(key.toLowerCase())?.[0]??null;
  const accounts = fields.get('account:') ?? [];
  const status = clean(html).match(/Status:\s*(COMPLETED|FAILED|PENDING|REVERSED|CANCELLED|SUCCESSFUL)/i)?.[1] ?? null;
  return {
    provider:'cbe', transactionId:get('Reference No. (VAT Invoice No):'), status,
    amount:toMoney(get('Transferred Amount:')),
    recipientName:get('Receiver:'), recipientAccountLast4:last4(accounts[1]),
    note:get('Reason / Type of service:'), transactionAt:cbeTimestamp(get('Payment Date & Time:')),
    paymentType:get('Payment Type:')
  };
}

/**
 * Telebirr receipts use two layouts:
 *  - two-column label/value rows (or paired inline blocks), and
 *  - a three-column invoice table: Invoice No. | Payment date | Settled Amount,
 *    with the corresponding values in the FOLLOWING row.
 * Never use an adjacent column heading as a field value. Missing fields fail closed.
 */
function parseTelebirrHtmlLegacy(html: string): Receipt {
  const stripped = html.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  const raw = stripped
    .replace(/<\/(?:td|th|tr|div|p|span|li|h[1-6]|section|label|strong|b)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const lines = unescapeHtml(raw).split(/\r?\n/).map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const key = (s: string): string => s.toLowerCase()
    .replace(/[：:]\s*$/u, '')
    .replace(/^[^a-z]+/u, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
  const aliases = {
    id: ['Receipt No.','Receipt Number','Invoice Number','Invoice No.','Invoice','Transaction Number','Transaction ID','Transaction Reference','Reference Number'],
    status: ['Transaction Status','Payment Status','Status'],
    amount: ['Settled Amount','Transferred Amount','Amount Paid','Amount'],
    recipient: ['Credited Party name','Recipient Name','Receiver Name','Recipient','Receiver'],
    account: ['Credited party account no','Credited party account no.','Recipient Account','Receiver Account','Recipient Phone','Receiver Phone','To Account'],
    note: ['Customer Note','Payment Note','Transaction Remark','Remark','Note'],
    date: ['Payment date','Transaction date','Date & Time','Date']
  };
  const isLabel = (s: string, options: string[]): boolean => {
    const normalized = key(s);
    return normalized.length > 0 && options.some(alias => normalized === key(alias));
  };
  const knownLabels = Object.values(aliases).flat();
  const isKnownLabel = (s:string):boolean => isLabel(s,knownLabels);
  const validId = (s:string|null|undefined):s is string => !!s && /^[A-Z0-9][A-Z0-9_-]{7,39}$/i.test(s.trim());
  const validAmount = (s:string|null|undefined):boolean =>
    !!s && /^\s*(?:ETB|Birr)?\s*\d[\d,]*(?:\.\d{1,2})?\s*(?:ETB|Birr)?\s*$/i.test(s);
  const parseDate = (value: string | null): string | null => {
    if (!value) return null;
    const dmy = value.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    const ymd = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (dmy || ymd) {
      const y=Number(dmy?.[3] ?? ymd?.[1]);
      const m=Number(dmy?.[2] ?? ymd?.[2]);
      const d=Number(dmy?.[1] ?? ymd?.[3]);
      const h=Number(dmy?.[4] ?? ymd?.[4]);
      const min=Number(dmy?.[5] ?? ymd?.[5]);
      const sec=Number(dmy?.[6] ?? ymd?.[6] ?? 0);
      if (m<1 || m>12 || d<1 || d>31 || h>23 || min>59 || sec>59) return null;
      const local = new Date(Date.UTC(y,m-1,d,h,min,sec));
      if (local.getUTCFullYear()!==y || local.getUTCMonth()!==m-1 || local.getUTCDate()!==d) return null;
      return new Date(local.getTime()-3*3600_000).toISOString();
    }
    const english=cbeTimestamp(value); if (english) return english;
    if (/\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/i.test(value)) {
      const timestamp=Date.parse(value);
      return Number.isNaN(timestamp)?null:new Date(timestamp).toISOString();
    }
    return null;
  };

  // Read cells BY ROW, rather than flattening all labels and assuming that
  // the next string is a value. Real Telebirr invoice tables have three headers
  // followed by a separate row containing transaction ID, date, amount.
  const rows = [...stripped.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map(row => [...row[1].matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
      .map(cell => clean(cell[2])).filter(Boolean)).filter(row => row.length>0);
  const pairs: {label:string;value:string}[] = [];
  let triplet: {id:string;date:string;amount:string}|null = null;
  for (let i=0;i<rows.length;i++) {
    const row=rows[i];
    if (row.length===2 && isKnownLabel(row[0]) && !isKnownLabel(row[1])) pairs.push({label:row[0],value:row[1]});
    const idIdx=row.findIndex(cell=>isLabel(cell,aliases.id));
    const dateIdx=row.findIndex(cell=>isLabel(cell,aliases.date));
    const amountIdx=row.findIndex(cell=>isLabel(cell,aliases.amount));
    if (idIdx>=0 && dateIdx>=0 && amountIdx>=0 && new Set([idIdx,dateIdx,amountIdx]).size===3) {
      // The values may be separated by <thead>/<tbody>, but keep their column positions.
      for (const candidate of rows.slice(i+1,i+4)) {
        const id=candidate[idIdx]?.trim(), date=candidate[dateIdx]?.trim(), amount=candidate[amountIdx]?.trim();
        if(validId(id) && parseDate(date??null) && validAmount(amount)) {
          triplet={id,date,amount}; break;
        }
      }
    }
  }
  // Some receipts use div/span grids rather than <tr>. Support the same
  // header-header-header / value-value-value layout after tag flattening.
  if (!triplet) {
    for (let i=0;i+5<lines.length;i++) {
      if(isLabel(lines[i],aliases.id) && isLabel(lines[i+1],aliases.date) && isLabel(lines[i+2],aliases.amount)
        && validId(lines[i+3]) && parseDate(lines[i+4]) && validAmount(lines[i+5])) {
        triplet={id:lines[i+3],date:lines[i+4],amount:lines[i+5]};break;
      }
    }
  }
  const candidateFor = (options:string[]):string[] => {
    const results:string[] = [];
    for(const pair of pairs) if (isLabel(pair.label,options)) results.push(pair.value);
    for(let i=0;i<lines.length;i++) {
      const line=lines[i];
      if(isLabel(line,options)) {
        const next=lines[i+1];
        if(next && !isKnownLabel(next)) results.push(next);
      }
      const colon=line.lastIndexOf(':');
      if(colon>=0 && isLabel(line.slice(0,colon),options)) {
        const value=line.slice(colon+1).trim();
        if(value && !isKnownLabel(value)) results.push(value);
      }
    }
    return results;
  };
  const firstValid=(options:string[], valid:(s:string)=>boolean = (s)=>s.length>0) =>
    candidateFor(options).find(s=>!isKnownLabel(s) && valid(s)) ?? null;
  const id=triplet?.id ?? firstValid(aliases.id,validId);
  const rawAmount=triplet?.amount ?? firstValid(aliases.amount,validAmount);
  const rawDate=triplet?.date ?? firstValid(aliases.date,s=>parseDate(s)!==null);
  return {
    provider:'telebirr',transactionId:id,
    status:firstValid(aliases.status,s=>/^(?:completed|successful|success|failed|pending|reversed|cancelled)$/i.test(s)),
    amount:toMoney(rawAmount),
    recipientName:firstValid(aliases.recipient),
    recipientAccountLast4:last4(firstValid(aliases.account)),
    note:firstValid(aliases.note),
    transactionAt:parseDate(rawDate)
  };
}

/**
 * Live Telebirr parsing delegates its payment fields to the original tested v5
 * parser, using the transaction number from the validated official URL/SMS.
 * V5 intentionally does not extract a timestamp; retain the separate strict
 * timestamp parsing for optional order time-window checks.
 *
 * Fixture-only parsing without an expected transaction ID uses the independent
 * generalized parser. Saved HTML is editable and cannot establish authenticity.
 */
export function parseTelebirrHtml(html: string, expectedTransactionId?: string): Receipt {
  if (!expectedTransactionId) return parseTelebirrHtmlLegacy(html);
  if (!/^[A-Z0-9]{6,32}$/i.test(expectedTransactionId)) throw new Error('Invalid Telebirr transaction ID');
  const id = expectedTransactionId.toUpperCase();
  const extracted = extractV5Telebirr(html,id);
  const optionalTime = parseTelebirrHtmlLegacy(html).transactionAt;
  return {
    provider:'telebirr',
    transactionId:extracted.invoice,
    status:extracted.status,
    amount:extracted.settledAmount,
    recipientName:extracted.recipientName,
    recipientAccountLast4:last4(extracted.recipientAccountMasked),
    note:extracted.customerNote,
    transactionAt:optionalTime
  };
}

export function normalizeInput(input: string, provider: Provider): { url:string; expectedTransactionId:string|null } {
  const urls = input.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
  let suppliedId: string | null = null;
  const cleanUrl = (s:string)=>s.replace(/[.,;)]+$/,'');
  const matched = urls.map(u=>cleanUrl(u)).filter(u=>{
    try {
      const url = new URL(u);
      return url.protocol==='https:' && (provider==='cbe' ? url.hostname==='mbreciept.cbe.com.et' : url.hostname==='transactioninfo.ethiotelecom.et');
    } catch {return false;}
  });
  // CBE's genuine SMS includes an unrelated customer-feedback link. Ignore only that known link.
  const feedback = /^https:\/\/forms\.gle\/kGNGQpG3mQCCk3iD6\/?$/i;
  const other = urls.map(u=>cleanUrl(u)).filter(u=>!matched.includes(u) && !feedback.test(u));
  if (other.length || (matched.length && new Set(matched).size!==1)) throw new Error('Untrusted, conflicting, or unsupported receipt URL');
  if (provider==='cbe') {
    if(matched.length!==1) throw new Error('CBE requires the full official receipt URL (or SMS containing it)');
    const url = new URL(matched[0]);
    if (!/^\/v2-[a-z0-9_-]+$/i.test(url.pathname) || url.search || url.hash || url.port || url.username || url.password) throw new Error('Unsupported CBE receipt URL');
    return {url:url.href,expectedTransactionId:null};
  }
  if(matched.length) {
    const url = new URL(matched[0]);
    if(!/^\/receipt\/[a-z0-9]{6,32}$/i.test(url.pathname) || url.search || url.hash || url.port || url.username || url.password) throw new Error('Unsupported Telebirr receipt URL');
    suppliedId = url.pathname.split('/').at(-1)!.toUpperCase();
  }
  const found = [...input.matchAll(/(?:transaction\s*(?:number|no\.?|id|reference)|invoice(?:\s*(?:number|no\.?|id))?)\s*(?:is\s+|[:#-]\s*)?([A-Z0-9]{6,32})/gi)].map(m=>m[1].toUpperCase());
  if (!matched.length && /^[A-Z0-9]{6,32}$/i.test(input.trim())) found.push(input.trim().toUpperCase());
  const allIds = new Set([...found,...(suppliedId?[suppliedId]:[])]);
  if(allIds.size !== 1) throw new Error(allIds.size ? 'Conflicting Telebirr transaction IDs' : 'Could not extract Telebirr transaction ID');
  const id = [...allIds][0];
  return {url:`https://transactioninfo.ethiotelecom.et/receipt/${id}`, expectedTransactionId:id};
}

export function compare(order:Order, receipt:Receipt):Comparison {
  const checks:Record<string,'PASS'|'FAIL'|'MISSING'> = {};
  const check=(name:string, value: unknown, expected: unknown, eq:(a:any,b:any)=>boolean=(a,b)=>a===b)=>{
    checks[name] = value===null || value===undefined || value==='' ? 'MISSING' : eq(value,expected) ? 'PASS':'FAIL';
  };
  check('provider',receipt.provider,order.provider);
  if(order.provider==='cbe') check('directAccountTransfer',receipt.paymentType,'A2A');
  check('transactionId',receipt.transactionId,true,(v)=>typeof v==='string' && /^[A-Z0-9_-]{6,40}$/i.test(v.trim()));
  check('status',receipt.status,'completed',(v)=>['completed','successful','success'].includes(String(v).trim().toLowerCase()));
  check('amount',receipt.amount,Math.round(order.amount*100),(a,b)=>Math.round(a*100)===b);
  check('recipientName',receipt.recipientName,normalizedName(order.recipientName),(a,b)=>normalizedName(String(a))===b);
  check('recipientAccountLast4',receipt.recipientAccountLast4,order.recipientAccountLast4);
  check('orderReference',receipt.note,order.reference,(a,b)=>String(a).trim()===b);
  if(order.createdAt || order.expiresAt) {
    check('transactionAt',receipt.transactionAt,true,(a)=>{
      const t=Date.parse(a);
      return !Number.isNaN(t) && (!order.createdAt || t>=Date.parse(order.createdAt)) && (!order.expiresAt || t<=Date.parse(order.expiresAt));
    });
  }
  const outcomes=Object.values(checks);
  return {outcome:outcomes.includes('FAIL')?'MISMATCH':outcomes.includes('MISSING')?'UNABLE_TO_VERIFY':'MATCH',checks};
}

export type ClaimResult = { outcome: Outcome; claimedBy?:string };
export function makeStore(dbPath: string): DatabaseSync {
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;');
  db.exec(`CREATE TABLE IF NOT EXISTS claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    transaction_id TEXT NOT NULL,
    merchant_id TEXT NOT NULL,
    order_id TEXT NOT NULL,
    created_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE(provider, transaction_id),
    UNIQUE(merchant_id, order_id)
  );`);
  return db;
}
export function claim(db: DatabaseSync, order:Order, receipt:Receipt):ClaimResult {
  if(!receipt.transactionId) return {outcome:'UNABLE_TO_VERIFY'};
  const txn=receipt.transactionId.trim().toUpperCase();
  db.exec('BEGIN IMMEDIATE');
  try {
    const used = db.prepare('SELECT merchant_id,order_id FROM claims WHERE provider=? AND transaction_id=?').get(order.provider,txn) as any;
    if(used) { db.exec('COMMIT'); return {outcome:'ALREADY_USED',claimedBy:`${used.merchant_id}/${used.order_id}`}; }
    const orderUsed = db.prepare('SELECT provider,transaction_id FROM claims WHERE merchant_id=? AND order_id=?').get(order.merchantId,order.orderId) as any;
    if(orderUsed) {db.exec('COMMIT'); return {outcome:'ORDER_ALREADY_CLAIMED'};}
    db.prepare('INSERT INTO claims (provider,transaction_id,merchant_id,order_id) VALUES (?,?,?,?)').run(order.provider,txn,order.merchantId,order.orderId);
    db.exec('COMMIT');
    return {outcome:'MATCH'};
  } catch(e) {db.exec('ROLLBACK'); throw e;}
}

export async function loadHtml(provider:Provider, input:string, offlineHtml?:string):Promise<{html:string;sourceUrl:string|null;expectedTransactionId:string|null}> {
  if(offlineHtml) return {html:await readFile(offlineHtml,'utf8'),sourceUrl:null,expectedTransactionId:null};
  const {url,expectedTransactionId}=normalizeInput(input,provider);
  if(provider==='telebirr') {
    // Use the exact HTTP fetch behavior proven by Telebirr POC v5 (including
    // response-size checks) rather than a new request implementation.
    const fetched=await fetchTelebirrV5(new URL(url));
    return {html:fetched.html,sourceUrl:url,expectedTransactionId};
  }
  let chromium:any;
  try {({chromium}=await import('playwright'));} catch { throw new Error('Install dependencies: npm install && npx playwright install chromium'); }
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();
    const response=await page.goto(url,{waitUntil:'domcontentloaded', timeout:30000});
    if(!response?.ok()) throw new Error(`CBE browser returned HTTP ${response?.status()??'no response'}`);
    if(page.url()!==url) throw new Error('CBE redirected away from the expected receipt URL');
    await page.getByText('Payment / Transaction Informations',{exact:true}).waitFor({timeout:20000});
    await page.getByText('Transferred Amount:',{exact:true}).waitFor({timeout:20000});
    const html=await page.content();
    if(html.length>2_000_000) throw new Error('Receipt response too large');
    return {html,sourceUrl:url,expectedTransactionId:null};
  } finally {await browser.close();}
}
