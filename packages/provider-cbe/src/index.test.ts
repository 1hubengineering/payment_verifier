import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  compareReceipt,
  createPaymentExpectation,
  parseEtbAmount,
} from '@1hubengineering/verifier';
import { retrieveHtml, RetrievalError } from '@1hubengineering/verifier/providers';
import { createCbeProvider } from './index.ts';

vi.mock('@1hubengineering/verifier/providers', async (importOriginal) => ({
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
    expect(compareReceipt(expected, result.evidence).status).toBe('MATCH');
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
    expect(await createCbeProvider().retrieve(url, { maxBytes: 5000 })).toMatchObject({
      kind: 'UNAVAILABLE',
      code: 'RECEIPT_TOO_LARGE',
    });
  }, 20_000);
  it('times out missing rendered fields and releases admission', async () => {
    const provider = createCbeProvider();
    vi.mocked(retrieveHtml).mockResolvedValue({ html: '<html>unsupported</html>', bytes: 24 });
    expect(await provider.retrieve(url, { timeoutMs: 1000 })).toMatchObject({
      kind: 'UNAVAILABLE',
      code: 'RECEIPT_RENDER_TIMEOUT',
    });
    vi.mocked(retrieveHtml).mockResolvedValue({ html, bytes: Buffer.byteLength(html) });
    expect((await provider.retrieve(url)).kind).toBe('EVIDENCE');
  }, 20_000);
  it('terminates an infinite inline script and admits a subsequent request', async () => {
    const provider = createCbeProvider();
    vi.mocked(retrieveHtml).mockResolvedValue({
      html: '<html><body><script>while (true) {}</script></body></html>',
      bytes: 64,
    });
    expect(await provider.retrieve(url, { timeoutMs: 1500 })).toMatchObject({
      kind: 'UNAVAILABLE',
      code: 'RECEIPT_RENDER_TIMEOUT',
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
    expect(await provider.retrieve(url)).toMatchObject({
      kind: 'UNAVAILABLE',
      code: 'PROVIDER_BUSY',
    });
    release({ html, bytes: Buffer.byteLength(html) });
    expect((await first).kind).toBe('EVIDENCE');
    expect((await provider.retrieve(url)).kind).toBe('EVIDENCE');
  }, 20_000);
  it('preserves provider unavailability and refuses invalid locators before transport', async () => {
    const provider = createCbeProvider();
    await expect(provider.retrieve('http://127.0.0.1/')).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
    expect(retrieveHtml).not.toHaveBeenCalled();
    vi.mocked(retrieveHtml).mockRejectedValue(new RetrievalError('DESTINATION_BLOCKED'));
    expect(await provider.retrieve(url)).toMatchObject({
      kind: 'UNAVAILABLE',
      code: 'DESTINATION_BLOCKED',
    });
  });
  it('reports unsupported provider HTML as unavailable, preserving the valid locator', async () => {
    vi.mocked(retrieveHtml).mockResolvedValue({
      html: '<div></div>'.repeat(4097) + html,
      bytes: 50000,
    });
    expect(await createCbeProvider().retrieve(url)).toMatchObject({
      kind: 'UNAVAILABLE',
      code: 'UNSUPPORTED_RECEIPT_FORMAT',
    });
  }, 20_000);
  it('uses the real Chromium OS sandbox and excludes inherited host secrets', async () => {
    const marker = 'RECEIPT_SYNTHETIC_CHILD_SECRET';
    const previous = process.env[marker];
    process.env[marker] = 'public-synthetic-marker';
    const children = (): Set<string> =>
      new Set(
        readFileSync(`/proc/self/task/${process.pid}/children`, 'utf8')
          .trim()
          .split(/\s+/u)
          .filter(Boolean),
      );
    const original = chromium.launch.bind(chromium);
    let observed = false;
    let launchFailure: unknown;
    const spy = vi.spyOn(chromium, 'launch').mockImplementation(async (options) => {
      const before = children();
      const browser = await original(options).catch((error) => {
        launchFailure = error;
        throw error;
      });
      try {
        const pid = [...children()].find((id) => !before.has(id));
        expect(pid).toBeDefined();
        const environment = readFileSync(`/proc/${pid}/environ`, 'utf8');
        expect(environment.includes(marker)).toBe(false);
        expect(environment.includes('public-synthetic-marker')).toBe(false);
        const command = readFileSync(`/proc/${pid}/cmdline`, 'utf8');
        expect(command).not.toContain('--no-sandbox');
        const page = await browser.newPage();
        try {
          await page.setContent('<html>synthetic sandbox probe</html>');
          const readStatus = (id: string): string => readFileSync(`/proc/${id}/status`, 'utf8');
          const filters = (status: string): number =>
            Number(/^Seccomp_filters:\s*(\d+)/mu.exec(status)?.[1]);
          const depth = (status: string): number =>
            /^NSpid:\s*([^\n]+)/mu.exec(status)![1]!.trim().split(/\s+/u).length;
          const broker = readStatus(pid!);
          const descendants = [pid!];
          let renderers = 0;
          for (let index = 0; index < descendants.length && index < 64; index++) {
            const id = descendants[index]!;
            const command = readFileSync(`/proc/${id}/cmdline`, 'utf8');
            if (command.includes('--type=renderer')) {
              const status = readStatus(id);
              expect(status).toMatch(/^Seccomp:\s*2$/mu);
              expect(filters(status)).toBeGreaterThan(filters(broker));
              expect(depth(status)).toBeGreaterThan(depth(broker));
              renderers++;
            }
            descendants.push(
              ...readFileSync(`/proc/${id}/task/${id}/children`, 'utf8')
                .trim()
                .split(/\s+/u)
                .filter(Boolean),
            );
          }
          expect(renderers).toBeGreaterThan(0);
        } finally {
          await page.close();
        }
        observed = true;
        return browser;
      } catch (error) {
        launchFailure = error;
        await browser.close();
        throw error;
      }
    });
    try {
      const result = await createCbeProvider().retrieve(url);
      if (launchFailure) throw launchFailure;
      expect(result.kind).toBe('EVIDENCE');
      expect(observed).toBe(true);
    } finally {
      spy.mockRestore();
      if (previous === undefined) delete process.env[marker];
      else process.env[marker] = previous;
    }
  }, 20_000);
  it('renders local receipt dates in Ethiopian time independently of the host environment', async () => {
    const timed = html.replace('Nov 13, 2026, 2:20 PM', 'synthetic-date-placeholder').replace(
      '</body>',
      `<script>
      const target = [...document.querySelectorAll('span')].find(span => span.textContent === 'synthetic-date-placeholder');
      target.textContent = new Intl.DateTimeFormat('en-US', {month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date('2026-11-13T11:20:00Z'));
    </script></body>`,
    );
    vi.mocked(retrieveHtml).mockResolvedValue({ html: timed, bytes: Buffer.byteLength(timed) });
    const result = await createCbeProvider().retrieve(url);
    expect(result.kind).toBe('EVIDENCE');
    if (result.kind !== 'EVIDENCE') throw new Error('Synthetic date rendering unavailable');
    expect(result.evidence.transactionAt).toBe(Date.parse('2026-11-13T11:20:00Z'));
    expect(compareReceipt(expected, result.evidence).status).toBe('MATCH');
  }, 20_000);
  it('fails unavailable when the OS sandbox cannot launch, with no unsafe fallback', async () => {
    const spy = vi
      .spyOn(chromium, 'launch')
      .mockRejectedValue(new Error('synthetic private sandbox detail'));
    const provider = createCbeProvider();
    try {
      await expect(provider.retrieve(url)).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
    expect((await provider.retrieve(url)).kind).toBe('EVIDENCE');
  }, 20_000);
  it('rejects invalid concurrency', () => {
    expect(() => createCbeProvider({ maxConcurrency: 0 })).toThrow();
    expect(() => createCbeProvider({ maxConcurrency: 1.5 })).toThrow();
  });
});
