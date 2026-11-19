import { lookup } from 'node:dns/promises';
import {
  cbeReceiptDataHost as cbeDataHost,
  isPublicDestination,
  RetrievalError,
} from '@1hubengineering/verifier/providers';
import type { ReceiptLocator, RetrievalOptions } from '@1hubengineering/verifier/providers';
import { launchCbeBrowser } from './render.ts';

const dataHeaders = {
  accept: 'application/json',
  // Public app metadata sent by the official CBE receipt page.
  'X-App-ID': 'd1292e42-7400-49de-a2d3-9731caa4c819',
  'X-App-Version': '0a01980b-9859-1369-8198-59f403820000',
};

async function publicAddress(): Promise<string> {
  const records = await lookup(cbeDataHost, { family: 4, all: true }).catch(() => {
    throw new RetrievalError('PROVIDER_DNS_ERROR', {}, true);
  });
  if (records.length === 0 || records.some(({ address }) => !isPublicDestination(address)))
    throw new RetrievalError('DESTINATION_BLOCKED');
  return records[0]!.address;
}

export async function retrieveCbeDataInBrowser(
  locator: ReceiptLocator,
  html: string,
  options: RetrievalOptions,
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxBytes = options.maxBytes ?? 2_000_000;
  const started = Date.now();
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const deadlineError = () =>
    options.signal?.aborted
      ? new RetrievalError('CANCELLED')
      : new RetrievalError('PROVIDER_TIMEOUT', { timeoutMs }, true);
  if (signal.aborted) throw deadlineError();
  let abort: () => void = () => {};
  const deadline = new Promise<never>((_resolve, reject) => {
    abort = () => reject(deadlineError());
    signal.addEventListener('abort', abort, { once: true });
  });
  let browser: Awaited<ReturnType<typeof launchCbeBrowser>> | undefined;
  try {
    const address = await Promise.race([publicAddress(), deadline]);
    const remaining = () => Math.max(1, timeoutMs - (Date.now() - started));
    if (signal.aborted) throw deadlineError();
    browser = await launchCbeBrowser(remaining(), options, address);
    if (signal.aborted) throw deadlineError();

    const identifier = new URL(locator.url).pathname.slice(1);
    const dataUrl = `https://${cbeDataHost}/api/v1/transactions/public/transaction-detail/${identifier}`;
    let status: number | undefined;
    const activeBrowser = browser;
    const work = async () => {
      const context = await activeBrowser.newContext({
        serviceWorkers: 'block',
        acceptDownloads: false,
        permissions: [],
        ignoreHTTPSErrors: false,
      });
      const page = await context.newPage();
      await context.routeWebSocket('**/*', (route) => route.close());
      let documentSupplied = false;
      let dataRequested = false;
      let preflightRequested = false;
      await context.route('**/*', async (route) => {
        const req = route.request();
        if (req.redirectedFrom()) return route.abort('blockedbyclient');
        if (
          !documentSupplied &&
          req.url() === locator.url &&
          req.isNavigationRequest() &&
          req.method() === 'GET' &&
          req.frame() === page.mainFrame()
        ) {
          documentSupplied = true;
          return route.fulfill({
            status: 200,
            contentType: 'text/html; charset=utf-8',
            body: html,
            headers: {
              'content-security-policy': `sandbox allow-same-origin; default-src 'none'; connect-src ${dataUrl}; base-uri 'none'; form-action 'none'`,
              'referrer-policy': 'strict-origin',
            },
          });
        }
        if (
          req.url() === dataUrl &&
          !req.isNavigationRequest() &&
          req.frame() === page.mainFrame()
        ) {
          if (req.method() === 'OPTIONS' && !preflightRequested) {
            preflightRequested = true;
            return route.continue();
          }
          if (req.method() === 'GET' && !dataRequested) {
            dataRequested = true;
            return route.continue();
          }
        }
        return route.abort('blockedbyclient');
      });
      context.on('response', (response) => {
        if (response.url() === dataUrl && response.request().method() === 'GET')
          status = response.status();
      });
      await page.goto(locator.url, { waitUntil: 'domcontentloaded', timeout: remaining() });
      if (!documentSupplied || page.url() !== locator.url)
        throw new RetrievalError('INVALID_PROVIDER_RESPONSE');
      // Execute only this read in the browser. The official page's scripts and assets stay blocked.
      return page.evaluate(
        async ({ url, headers, budget, bytes }) => {
          let response: Response;
          try {
            response = await fetch(url, {
              method: 'GET',
              headers,
              credentials: 'omit',
              redirect: 'error',
              signal: AbortSignal.timeout(budget),
            });
          } catch {
            return { kind: 'NETWORK' } as const;
          }
          if (response.status !== 200) return { kind: 'HTTP', status: response.status } as const;
          if (
            !response.body ||
            response.url !== url ||
            !/^application\/json(?:\s*;|\s*$)/i.test(response.headers.get('content-type') ?? '')
          )
            return { kind: 'INVALID' } as const;
          const reader = response.body.getReader();
          const decoder = new TextDecoder('utf-8', { fatal: true });
          const parts: string[] = [];
          let length = 0;
          try {
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              length += value.byteLength;
              if (length > bytes) {
                await reader.cancel();
                return { kind: 'OVERSIZE' } as const;
              }
              parts.push(decoder.decode(value, { stream: true }));
            }
            parts.push(decoder.decode());
          } catch {
            return { kind: 'INVALID' } as const;
          }
          return length > 0
            ? ({ kind: 'OK', body: parts.join('') } as const)
            : ({ kind: 'INVALID' } as const);
        },
        { url: dataUrl, headers: dataHeaders, budget: remaining(), bytes: maxBytes },
      );
    };

    const result = await Promise.race([work(), deadline]);
    if (signal.aborted) throw deadlineError();
    if (result.kind === 'OK') return result.body;
    if (result.kind === 'OVERSIZE') throw new RetrievalError('RECEIPT_TOO_LARGE');
    const httpStatus = result.kind === 'HTTP' ? result.status : status;
    if (httpStatus === 429) throw new RetrievalError('PROVIDER_RATE_LIMITED', { httpStatus }, true);
    if (httpStatus && httpStatus !== 200)
      throw new RetrievalError(
        'PROVIDER_HTTP_ERROR',
        { httpStatus },
        [408, 502, 503, 504].includes(httpStatus),
      );
    if (result.kind === 'NETWORK') throw new RetrievalError('PROVIDER_NETWORK_ERROR', {}, true);
    throw new RetrievalError('INVALID_PROVIDER_RESPONSE');
  } catch (error) {
    if (signal.aborted) throw deadlineError();
    if (error instanceof Error && error.name === 'TimeoutError')
      throw new RetrievalError('PROVIDER_TIMEOUT', { timeoutMs }, true);
    throw error;
  } finally {
    signal.removeEventListener('abort', abort);
    await browser?.close();
  }
}
