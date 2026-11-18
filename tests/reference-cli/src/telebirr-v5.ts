/**
 * Original Telebirr POC v5 receipt extraction, retained from the user-provided
 * telebirr-poc-v5(1).zip. The functions below are copied from v5, unmodified.
 * Their successful live receipt test is historic evidence; recheck the combined
 * CLI on a live receipt before relying on it.
 */
const RECEIPT_MAX_BYTES = 2_000_000;
export type V5Receipt = {
  invoice: string | null;
  status: string | null;
  settledAmount: number | null;
  recipientName: string | null;
  recipientAccountMasked: string | null;
  customerNote: string | null;
};
type Receipt = V5Receipt;
function officialUrl(input: string): URL {
  const url = new URL(input);
  if (url.protocol !== 'https:' || url.hostname !== 'transactioninfo.ethiotelecom.et' ||
      url.port || url.username || url.password || url.search || url.hash ||
      !/^\/receipt\/[A-Za-z0-9]+$/.test(url.pathname)) {
    throw new Error('Only exact official Telebirr HTTPS receipt URLs are accepted');
  }
  return url;
}

// Accept an ID (preferred), an approved receipt URL, or a pasted Telebirr SMS.
// The SMS itself is untrusted: use it only to locate the provider's official receipt.

function clean(markup: string): string {
  return markup
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<!--([\s\S]*?)-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:nbsp|#160);/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:x([0-9a-f]+)|([0-9]+));/gi, (_whole, hex, dec) => {
      const code = parseInt(hex ?? dec, hex ? 16 : 10);
      return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ' ';
    })
    .replace(/\s+/g, ' ').trim();
}

function tableRows(html: string): string[][] {
  return [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)].map(row =>
    [...row[1].matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)\s*>/gi)]
      .map(cell => clean(cell[1]))
  );
}

function getNextCell(rows: string[][], label: RegExp): string | null {
  for (const row of rows) {
    const index = row.findIndex(cell => label.test(cell));
    if (index >= 0 && index + 1 < row.length) return row[index + 1];
  }
  return null;
}

function getAfter(text: string, label: RegExp, until: RegExp, length = 160): string | null {
  const found = label.exec(text);
  if (!found) return null;
  let rest = text.slice(found.index + found[0].length, found.index + found[0].length + length);
  const stop = until.exec(rest);
  if (stop) rest = rest.slice(0, stop.index);
  return rest.trim();
}

function getAmount(rows: string[][], text: string, receiptId: string): number | null {
  // Receipt table: header [Invoice No., Payment date, Settled Amount]
  //                next row [receipt id, timestamp, 20 Birr].
  for (let i = 0; i + 1 < rows.length; i++) {
    const header = rows[i];
    const amountIndex = header.findIndex(cell => /\bSettled\s+Amount\b/i.test(cell));
    if (amountIndex < 0) continue;
    const next = rows[i + 1];
    if (!next.some(cell => cell.includes(receiptId))) continue;
    const match = next[amountIndex]?.match(/^\s*(?:ETB\s*)?([\d,]+(?:\.\d{1,2})?)\s*(?:Birr|ETB)?\s*$/i);
    if (match) return Number(match[1].replace(/,/g, ''));
  }
  // Fall back to the technique validated against the first live receipt.
  for (const found of text.matchAll(/Settled\s+Amount/gi)) {
    const rest = text.slice((found.index ?? 0) + found[0].length, (found.index ?? 0) + found[0].length + 350);
    const stop = rest.search(/\b(?:Stamp\s+Duty|Discount\s+Amount|Service\s+fee|Total\s+Paid\s+Amount)\b/i);
    const segment = stop >= 0 ? rest.slice(0, stop) : rest.slice(0, 180);
    const amounts = [...segment.matchAll(/\b(?:ETB\s*)?([\d,]+(?:\.\d{1,2})?)\s*(?:Birr|ETB)\b/gi)];
    if (amounts.length === 1) return Number(amounts[0][1].replace(/,/g, ''));
  }
  return null;
}

function extract(html: string, receiptId: string): Receipt {
  const rows = tableRows(html);
  const text = clean(html);
  const invoice = text.match(new RegExp(`\\b${receiptId}\\b`, 'i'))?.[0] ?? null;
  const status = getNextCell(rows, /transaction\s+status/i) ??
    getAfter(text, /transaction\s+status/i, /Invoice\s+details|Invoice\s+No\.?/i, 90);
  const nameRaw = getNextCell(rows, /Credited\s+Party\s+Name/i) ??
    getAfter(text, /Credited\s+Party\s+Name/i, /Credited\s+party\s+account\s+no|transaction\s+status/i);
  const accountRaw = getNextCell(rows, /Credited\s+party\s+account\s+no/i) ??
    getAfter(text, /Credited\s+party\s+account\s+no/i, /transaction\s+status/i, 90);
  const recipientName = nameRaw?.match(/[A-Za-z][A-Za-z .'-]{2,75}/)?.[0]?.trim() ?? null;
  const recipientAccountMasked = accountRaw?.match(/\b\d{4}\s*[xX*•]{2,}\s*\d{4}\b/)?.[0] ?? null;
  // A known empty cell is distinct from a field that could not be read (null).
  let customerNote = getNextCell(rows, /Customer\s+Note/i);
  if (customerNote === null) {
    const region = getAfter(text, /Customer\s+Note/i,
      /Scan\s+the\s+QR|Thank\s+you\s+for\s+using\s+telebirr|Please\s+contact\s+us/i, 200);
    // Only trust fallback text if it is short and not part of the page footer.
    if (region && region.length <= 100 && !/^(?:[\s-]|Scan)/i.test(region)) customerNote = region;
  }
  return {
    invoice,
    status: status?.match(/\b(Completed|Successful|Pending|Failed)\b/i)?.[0] ?? null,
    settledAmount: getAmount(rows, text, receiptId),
    recipientName,
    recipientAccountMasked,
    customerNote,
  };
}



async function fetchReceipt(url: URL): Promise<{ html: string; status: number; contentType: string }> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000), redirect: 'error',
    headers: {Accept:'text/html'},
  });
  const contentType = response.headers.get('content-type') ?? '';
  if (!response.ok) throw new Error(`Provider HTTP ${response.status}`);
  if (!contentType.toLowerCase().includes('text/html')) throw new Error(`Unexpected provider content type: ${contentType}`);
  const len = Number(response.headers.get('content-length'));
  if (len && len > RECEIPT_MAX_BYTES) throw new Error('Provider response exceeds receipt size limit');
  if (!response.body) throw new Error('Provider returned empty body');
  const reader = response.body.getReader();
  let total = 0;
  const pieces: Uint8Array[] = [];
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    total += value.length;
    if (total > RECEIPT_MAX_BYTES) {
      await reader.cancel();
      throw new Error('Provider response exceeds receipt size limit');
    }
    pieces.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const piece of pieces) { merged.set(piece, offset); offset += piece.length; }
  return {html: new TextDecoder().decode(merged), status: response.status, contentType};
}


// Public adapter functions; the original v5 extraction/fetch routines above stay intact.
export const extractV5Telebirr = extract;
export function fetchTelebirrV5(url: URL) { return fetchReceipt(officialUrl(url.href)); }
