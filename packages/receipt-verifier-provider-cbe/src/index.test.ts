import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { compareReceipt, createPaymentExpectation, parseEtbAmount } from '@andhub/receipt-verifier';
import { retrieveHtml, RetrievalError } from '@andhub/receipt-verifier/providers';
import { createCbeProvider } from './index.ts';

vi.mock('@andhub/receipt-verifier/providers', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  retrieveHtml: vi.fn(),
}));
const html = readFileSync(
  new URL('../../../tests/reference-cli/fixtures/cbe.mock.html', import.meta.url),
  'utf8',
);
const url = 'https://mbreciept.cbe.com.et/v2-SYNTHETIC';
const expected = createPaymentExpectation({
  tenantId: 'synthetic',
  paymentId: 'synthetic',
  provider: 'cbe',
  currency: 'ETB',
  amountMinor: parseEtbAmount('230'),
  recipientName: 'Example Merchant',
  recipientAccountLast4: '4867',
  reference: 'AH-TEST-5932',
  validFrom: Date.parse('2026-11-13T11:19:00Z'),
  validUntil: Date.parse('2026-11-13T11:21:00Z'),
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(retrieveHtml).mockResolvedValue({ html, bytes: Buffer.byteLength(html) });
});

describe('optional CBE execution with real Chromium and mocked provider transport', () => {
  it('retrieves through the bounded transport and parses the rendered synthetic receipt', async () => {
    const result = await createCbeProvider().retrieve(url);
    expect(result.kind).toBe('EVIDENCE');
    if (result.kind !== 'EVIDENCE') throw new Error(JSON.stringify(result));
    expect(compareReceipt(expected, result.evidence).verificationStatus).toBe(
      'MATCHED_RECEIPT_ONLY',
    );
    expect(result.provenance).toMatchObject({ kind: 'OFFICIAL_HTTPS', url });
    expect(retrieveHtml).toHaveBeenCalledTimes(1);
  }, 20_000);
  it('blocks browser-owned network, popups, frames, websocket and service workers', async () => {
    let requests = 0;
    const server = createServer((_req, res) => {
      requests++;
      res.end('unexpected');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing server address');
    const target = `http://127.0.0.1:${address.port}`;
    const attacks = `<img src="${target}"><iframe src="${target}"></iframe><link rel="preconnect" href="${target}"><script>
      fetch('${target}').catch(()=>{}); window.open('${target}');
      try { new WebSocket('ws://127.0.0.1:${address.port}'); } catch {}
      navigator.serviceWorker?.register('${target}/worker.js').catch(()=>{});
    </script>`;
    vi.mocked(retrieveHtml).mockResolvedValue({
      html: html.replace('</body>', attacks + '</body>'),
      bytes: Buffer.byteLength(html),
    });
    try {
      expect((await createCbeProvider().retrieve(url)).kind).toBe('EVIDENCE');
      expect(requests).toBe(0);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 20_000);
  it('bounds DOM expansion separately from downloaded bytes', async () => {
    vi.mocked(retrieveHtml).mockResolvedValue({
      html: html.replace(
        '</body>',
        "<script>document.body.append('x'.repeat(100000))</script></body>",
      ),
      bytes: Buffer.byteLength(html),
    });
    expect(await createCbeProvider().retrieve(url, { maxBytes: 5000 })).toEqual({
      kind: 'UNAVAILABLE',
      code: 'TOO_LARGE',
    });
  }, 20_000);
  it('times out missing rendered fields and releases admission', async () => {
    const provider = createCbeProvider();
    vi.mocked(retrieveHtml).mockResolvedValue({ html: '<html>unsupported</html>', bytes: 24 });
    expect(await provider.retrieve(url, { timeoutMs: 1000 })).toEqual({
      kind: 'UNAVAILABLE',
      code: 'TIMEOUT',
    });
    vi.mocked(retrieveHtml).mockResolvedValue({ html, bytes: Buffer.byteLength(html) });
    expect((await provider.retrieve(url)).kind).toBe('EVIDENCE');
  }, 20_000);
  it('rejects excess work without starting another retrieval, then recovers capacity', async () => {
    let release!: (value: { html: string; bytes: number }) => void;
    vi.mocked(retrieveHtml).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const provider = createCbeProvider();
    const first = provider.retrieve(url);
    expect(await provider.retrieve(url)).toEqual({ kind: 'UNAVAILABLE', code: 'BUSY' });
    release({ html, bytes: Buffer.byteLength(html) });
    expect((await first).kind).toBe('EVIDENCE');
    expect((await provider.retrieve(url)).kind).toBe('EVIDENCE');
  }, 20_000);
  it('preserves provider unavailability and refuses invalid locators before transport', async () => {
    const provider = createCbeProvider();
    expect(await provider.retrieve('http://127.0.0.1/')).toEqual({
      kind: 'UNAVAILABLE',
      code: 'INVALID_LOCATOR',
    });
    expect(retrieveHtml).not.toHaveBeenCalled();
    vi.mocked(retrieveHtml).mockRejectedValue(new RetrievalError('DESTINATION_BLOCKED'));
    expect(await provider.retrieve(url)).toEqual({
      kind: 'UNAVAILABLE',
      code: 'DESTINATION_BLOCKED',
    });
  });
  it('rejects invalid concurrency', () => {
    expect(() => createCbeProvider({ maxConcurrency: 0 })).toThrow();
    expect(() => createCbeProvider({ maxConcurrency: 1.5 })).toThrow();
  });
});
