import { lookup } from 'node:dns/promises';
import { normalizeReceiptLocator } from '@1hubengineering/verifier/providers';
import type { Route } from 'playwright';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { retrieveCbeDataInBrowser } from './browser-data.ts';
import { launchCbeBrowser } from './render.ts';

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));
vi.mock('./render.ts', () => ({ launchCbeBrowser: vi.fn() }));

const locator = normalizeReceiptLocator('cbe', 'v2-Synthetic_Id');
const endpoint =
  'https://mb.cbe.com.et/api/v1/transactions/public/transaction-detail/v2-Synthetic_Id';
const html = '<!doctype html><title>Synthetic receipt</title>';

function mockRoute(url: string, method: string, navigation = false) {
  const frame = {};
  const route = {
    request: () => ({
      url: () => url,
      method: () => method,
      isNavigationRequest: () => navigation,
      redirectedFrom: () => null,
      frame: () => frame,
    }),
    fulfill: vi.fn(),
    continue: vi.fn(),
    abort: vi.fn(),
  };
  return { frame, route };
}

function browserFixture() {
  let action: (route: Route) => Promise<void> = async () => {};
  const { frame, route: document } = mockRoute(locator.url, 'GET', true);
  const req = (url: string, method: string) => {
    const { route } = mockRoute(url, method);
    return { ...route, request: () => ({ ...route.request(), frame: () => frame }) };
  };
  const data = req(endpoint, 'GET');
  const second = req(endpoint, 'GET');
  const post = req(endpoint, 'POST');
  const thirdParty = req('https://example.invalid/data', 'GET');
  const otherPath = req(
    'https://mb.cbe.com.et/api/v1/transactions/public/transaction-detail/v2-Other',
    'GET',
  );
  const gate = (route: ReturnType<typeof mockRoute>['route']) => action(route as unknown as Route);
  const page = {
    mainFrame: () => frame,
    url: () => locator.url,
    goto: vi.fn(() => gate(document)),
    async evaluate<A, R>(f: (arg: A) => R, arg: A) {
      await gate(thirdParty);
      await gate(otherPath);
      await gate(post);
      await gate(data);
      await gate(second);
      return f(arg);
    },
  };
  const browser = {
    newContext: vi.fn(() => ({
      newPage: () => page,
      routeWebSocket: vi.fn(),
      route: (_pattern: string, next: typeof action) => {
        action = next;
      },
      on: vi.fn(),
    })),
    close: vi.fn(),
  };
  vi.mocked(launchCbeBrowser).mockResolvedValue(
    browser as unknown as Awaited<ReturnType<typeof launchCbeBrowser>>,
  );
  return { browser, document, data, second, post, thirdParty, otherPath };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(lookup).mockResolvedValue([{ address: '8.8.8.8', family: 4 }] as never);
});
afterEach(() => vi.unstubAllGlobals());

describe('scoped CBE browser request', () => {
  it('uses the validated page origin and admits one data GET without credentials or redirects', async () => {
    const fixture = browserFixture();
    const fetch = vi.fn(
      () =>
        new Response('{"id":"FTSYNTHETIC"}', { headers: { 'content-type': 'application/json' } }),
    );
    // Response objects constructed by a test have no network URL.
    vi.stubGlobal('fetch', async (...args: []) => {
      const response = fetch(...args);
      Object.defineProperty(response, 'url', { value: endpoint });
      return response;
    });
    await expect(retrieveCbeDataInBrowser(locator, html, { timeoutMs: 2000 })).resolves.toBe(
      '{"id":"FTSYNTHETIC"}',
    );
    expect(launchCbeBrowser).toHaveBeenCalledWith(
      expect.any(Number),
      { timeoutMs: 2000 },
      '8.8.8.8',
    );
    expect(fixture.document.fulfill).toHaveBeenCalledWith(
      expect.objectContaining({
        body: html,
        headers: expect.objectContaining({
          'content-security-policy': expect.stringContaining(
            "default-src 'none'; connect-src " + endpoint,
          ),
        }),
      }),
    );
    expect(fetch).toHaveBeenCalledWith(
      endpoint,
      expect.objectContaining({ credentials: 'omit', redirect: 'error', method: 'GET' }),
    );
    expect(fixture.data.continue).toHaveBeenCalledOnce();
    for (const denied of [fixture.second, fixture.post, fixture.thirdParty, fixture.otherPath])
      expect(denied.abort).toHaveBeenCalledOnce();
    expect(fixture.browser.close).toHaveBeenCalledOnce();
  });

  it('rejects a mixed public/private DNS result before it can start a browser', async () => {
    vi.mocked(lookup).mockResolvedValue([
      { address: '8.8.8.8', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ] as never);
    await expect(retrieveCbeDataInBrowser(locator, html, {})).rejects.toMatchObject({
      code: 'DESTINATION_BLOCKED',
    });
    expect(launchCbeBrowser).not.toHaveBeenCalled();
  });

  it('classifies authorization and oversized decoded data without returning evidence', async () => {
    const fixture = browserFixture();
    vi.stubGlobal('fetch', () => new Response(null, { status: 401 }));
    await expect(retrieveCbeDataInBrowser(locator, html, {})).rejects.toMatchObject({
      code: 'PROVIDER_HTTP_ERROR',
      details: { httpStatus: 401 },
      retryable: false,
    });
    vi.stubGlobal('fetch', () => {
      const response = new Response('{"id":"FTSYNTHETIC"}', {
        headers: { 'content-type': 'application/json' },
      });
      Object.defineProperty(response, 'url', { value: endpoint });
      return response;
    });
    await expect(retrieveCbeDataInBrowser(locator, html, { maxBytes: 10 })).rejects.toMatchObject({
      code: 'RECEIPT_TOO_LARGE',
    });
    expect(fixture.browser.close).toHaveBeenCalledTimes(2);
  });
});
