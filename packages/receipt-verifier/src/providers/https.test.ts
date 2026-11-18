import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { lookup } from 'node:dns';
import { request } from 'node:https';
import type { ClientRequest, IncomingMessage } from 'node:http';
import type { RequestOptions } from 'node:https';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { isPublicDestination, retrieveHtml } from './https.ts';
import { normalizeReceiptLocator } from './locator.ts';
import { retrieveTelebirr } from './index.ts';

vi.mock('node:https', () => ({ request: vi.fn() }));
vi.mock('node:dns', () => ({ lookup: vi.fn() }));
const locator = normalizeReceiptLocator('telebirr', 'TEST1234AB');
let addresses = ['8.8.8.8'];
let responseStatus = 200;
let responseHeaders: Record<string, string> = {};
let chunks: Buffer[] = [];
let hang = false;
let connections = 0;
let destroyed = false;
let capturedOptions: RequestOptions;

function fakeRequest(
  _url: unknown,
  options: RequestOptions,
  callback: (res: IncomingMessage) => void,
): ClientRequest {
  capturedOptions = options;
  const req = new EventEmitter() as ClientRequest;
  req.destroy = () => {
    destroyed = true;
    return req;
  };
  req.end = (() => {
    options.lookup!('transactioninfo.ethiotelecom.et', {}, (error) => {
      if (error) {
        req.emit('error', error);
        return;
      }
      connections++;
      if (hang || destroyed) return;
      const response = new PassThrough() as unknown as IncomingMessage;
      response.statusCode = responseStatus;
      response.headers = responseHeaders;
      callback(response);
      for (const chunk of chunks) response.push(chunk);
      response.push(null);
    });
    return req;
  }) as ClientRequest['end'];
  return req;
}

beforeEach(() => {
  vi.resetAllMocks();
  addresses = ['8.8.8.8'];
  responseStatus = 200;
  responseHeaders = { 'content-type': 'text/html; charset=utf-8' };
  chunks = [Buffer.from('<html>synthetic</html>')];
  hang = false;
  connections = 0;
  destroyed = false;
  vi.mocked(request).mockImplementation(fakeRequest as typeof request);
  vi.mocked(lookup).mockImplementation(((
    _host: unknown,
    _opts: unknown,
    callback: (error: Error | null, records: { address: string; family: number }[]) => void,
  ) => {
    queueMicrotask(() =>
      callback(
        null,
        addresses.map((address) => ({ address, family: 4 })),
      ),
    );
  }) as typeof lookup);
});

describe('bounded HTTPS with local transport/DNS mocks', () => {
  it('pins the checked lookup result to the TLS socket and preserves TLS verification', async () => {
    expect(await retrieveHtml(locator)).toMatchObject({
      html: '<html>synthetic</html>',
      bytes: 22,
    });
    expect(connections).toBe(1);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(capturedOptions).toMatchObject({
      agent: false,
      family: 4,
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
      maxHeaderSize: 16384,
    });
  });
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '100.64.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.1',
    '192.0.2.1',
    '198.18.0.1',
    '224.0.0.1',
    '255.255.255.255',
    '::1',
    '::ffff:8.8.8.8',
  ])('rejects DNS destination %s before a connection', async (address) => {
    addresses = [address];
    await expect(retrieveHtml(locator)).rejects.toMatchObject({ code: 'DESTINATION_BLOCKED' });
    expect(connections).toBe(0);
  });
  it('rejects mixed public/private DNS answers', async () => {
    addresses = ['8.8.8.8', '127.0.0.1'];
    await expect(retrieveHtml(locator)).rejects.toMatchObject({ code: 'DESTINATION_BLOCKED' });
    expect(connections).toBe(0);
  });
  it('rechecks DNS for each fresh connection, preventing reuse after rebinding', async () => {
    await retrieveHtml(locator);
    addresses = ['127.0.0.1'];
    await expect(retrieveHtml(locator)).rejects.toMatchObject({ code: 'DESTINATION_BLOCKED' });
    expect(connections).toBe(1);
  });
  it.each([301, 302, 307, 404, 500])(
    'does not follow HTTP %s or turn it into a mismatch',
    async (status) => {
      responseStatus = status;
      responseHeaders.location = 'http://127.0.0.1/';
      expect(await retrieveTelebirr('TEST1234AB')).toEqual({
        kind: 'UNAVAILABLE',
        code: 'PROVIDER_UNAVAILABLE',
      });
      expect(request).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    { 'content-type': 'application/json' },
    { 'content-type': 'text/html', 'content-encoding': 'gzip' },
  ])('rejects unexpected response metadata %#', async (headers) => {
    responseHeaders = headers;
    await expect(retrieveHtml(locator)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('enforces advertised and streamed byte bounds', async () => {
    responseHeaders['content-length'] = '100';
    await expect(retrieveHtml(locator, { maxBytes: 10 })).rejects.toMatchObject({
      code: 'TOO_LARGE',
    });
    delete responseHeaders['content-length'];
    destroyed = false;
    chunks = [Buffer.from('123456'), Buffer.from('78901')];
    await expect(retrieveHtml(locator, { maxBytes: 10 })).rejects.toMatchObject({
      code: 'TOO_LARGE',
    });
  });
  it('rejects empty bodies and invalid UTF-8', async () => {
    chunks = [];
    await expect(retrieveHtml(locator)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    chunks = [Buffer.from([0xff])];
    destroyed = false;
    await expect(retrieveHtml(locator)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('enforces a total deadline and destroys the request', async () => {
    hang = true;
    expect(await retrieveTelebirr('TEST1234AB', { timeoutMs: 10 })).toEqual({
      kind: 'UNAVAILABLE',
      code: 'TIMEOUT',
    });
    expect(destroyed).toBe(true);
  });
  it('cancels work before and during retrieval', async () => {
    const before = AbortSignal.abort();
    await expect(retrieveHtml(locator, { signal: before })).rejects.toMatchObject({
      code: 'CANCELLED',
    });
    expect(request).not.toHaveBeenCalled();
    const controller = new AbortController();
    hang = true;
    const pending = retrieveHtml(locator, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(destroyed).toBe(true);
  });
  it('does not leak raw network errors or receipt values', async () => {
    vi.mocked(request).mockImplementation((() => {
      throw new Error('private URL or token');
    }) as typeof request);
    expect(await retrieveTelebirr('TEST1234AB')).toEqual({
      kind: 'UNAVAILABLE',
      code: 'PROVIDER_UNAVAILABLE',
    });
  });
  it('refuses forged locators and invalid bounds before requests', async () => {
    await expect(retrieveHtml({ ...locator, url: 'https://evil.test/' })).rejects.toMatchObject({
      code: 'INVALID_LOCATOR',
    });
    await expect(retrieveHtml(locator, { maxBytes: Infinity })).rejects.toThrow(TypeError);
    await expect(retrieveHtml(locator, { timeoutMs: 0 })).rejects.toThrow(TypeError);
    expect(request).not.toHaveBeenCalled();
  });
  it('retains retrieved provenance separately from saved HTML', async () => {
    chunks = [Buffer.from('<html>unrecognized</html>')];
    expect(await retrieveTelebirr('TEST1234AB')).toMatchObject({
      kind: 'EVIDENCE',
      provenance: { kind: 'OFFICIAL_HTTPS', url: locator.url, parserVersion: '1' },
      evidence: { transactionId: null },
    });
  });
});

describe('public IPv4 destination classification', () => {
  it.each(['8.8.8.8', '1.1.1.1'])('permits public address %s', (address) =>
    expect(isPublicDestination(address)).toBe(true),
  );
  it.each(['0.0.0.0', '127.1', '0127.0.0.1', 'localhost', '2001:4860:4860::8888'])(
    'fails closed for %s',
    (address) => expect(isPublicDestination(address)).toBe(false),
  );
});
