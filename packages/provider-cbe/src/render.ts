import { chromium } from 'playwright';
import { RetrievalError } from '@1hubengineering/verifier/providers';
import type { RetrievalOptions } from '@1hubengineering/verifier/providers';

/** Internal browser boundary: no browser-owned provider connections. */
export async function renderCbeHtml(
  url: string,
  html: string,
  options: RetrievalOptions,
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? 15_000,
    maxBytes = options.maxBytes ?? 2_000_000;
  if (options.signal?.aborted) throw new RetrievalError('CANCELLED');
  const started = Date.now();
  const browser = await chromium
    .launch({
      headless: true,
      chromiumSandbox: true,
      env: { LANG: 'C.UTF-8', TZ: 'UTC' },
      timeout: timeoutMs,
      args: [
        '--disable-background-networking',
        '--disable-component-update',
        '--disable-sync',
        '--host-resolver-rules=MAP * ~NOTFOUND',
        '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
        '--js-flags=--max-old-space-size=128',
      ],
      proxy: { server: 'http://127.0.0.1:9', bypass: '<-loopback>' },
    })
    .catch((cause: unknown) => {
      if (options.signal?.aborted) throw new RetrievalError('CANCELLED', {}, false, { cause });
      if (cause instanceof Error && cause.name === 'TimeoutError') throw cause;
      throw new RetrievalError('RECEIPT_BROWSER_UNAVAILABLE', {}, false, { cause });
    });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => void) | undefined;
  try {
    if (options.signal?.aborted) throw new RetrievalError('CANCELLED');
    const remaining = timeoutMs - (Date.now() - started);
    if (remaining <= 0) throw new RetrievalError('RECEIPT_RENDER_TIMEOUT', { timeoutMs }, true);
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new RetrievalError('RECEIPT_RENDER_TIMEOUT', { timeoutMs }, true)),
        remaining,
      );
      cancel = () => reject(new RetrievalError('CANCELLED'));
      options.signal?.addEventListener('abort', cancel, { once: true });
    });
    const work = async (): Promise<string> => {
      const context = await browser.newContext({
        serviceWorkers: 'block',
        locale: 'en-US',
        timezoneId: 'Africa/Addis_Ababa',
        acceptDownloads: false,
        permissions: [],
      });
      const page = await context.newPage();
      context.on('page', (popup) => {
        if (popup !== page) void popup.close().catch(() => {});
      });
      await context.routeWebSocket('**/*', (route) => route.close());
      let supplied = false;
      await context.route('**/*', async (route) => {
        const req = route.request();
        if (
          !supplied &&
          req.url() === url &&
          req.resourceType() === 'document' &&
          req.frame() === page.mainFrame()
        ) {
          supplied = true;
          await route.fulfill({
            status: 200,
            contentType: 'text/html; charset=utf-8',
            body: html,
            headers: {
              'content-security-policy':
                "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
            },
          });
        } else await route.abort('blockedbyclient');
      });
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: remaining });
      await page
        .getByText('Payment / Transaction Informations', { exact: true })
        .waitFor({ timeout: remaining });
      await page.getByText('Transferred Amount:', { exact: true }).waitFor({ timeout: remaining });
      const length = await page.evaluate<number>('document.documentElement.outerHTML.length');
      if (length > maxBytes) throw new RetrievalError('RECEIPT_TOO_LARGE');
      const rendered = await page.content();
      if (Buffer.byteLength(rendered) > maxBytes) throw new RetrievalError('RECEIPT_TOO_LARGE');
      return rendered;
    };
    return await Promise.race([work(), deadline]);
  } finally {
    clearTimeout(timer);
    if (cancel) options.signal?.removeEventListener('abort', cancel);
    await browser.close();
  }
}
