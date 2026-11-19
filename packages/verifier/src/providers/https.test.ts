import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { lookup } from 'node:dns';
import { request } from 'node:https';
import { connect } from 'node:tls';
import type { ConnectionOptions, TLSSocket } from 'node:tls';
import type { ClientRequest, IncomingMessage } from 'node:http';
import type { RequestOptions } from 'node:https';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { checkProviderConnectivity, isPublicDestination, retrieveHtml } from './https.ts';
import { normalizeReceiptLocator } from './locator.ts';
import { retrieveTelebirr } from './index.ts';

vi.mock('node:https', () => ({ request: vi.fn() }));
vi.mock('node:dns', () => ({ lookup: vi.fn() }));
vi.mock('node:tls', () => ({ connect: vi.fn() }));
const locator = normalizeReceiptLocator('telebirr', 'TEST1234AB');
let addresses = ['8.8.8.8'];
let responseStatus = 200;
let responseHeaders: Record<string, string> = {};
let chunks: Buffer[] = [];
let hang = false;
let connections = 0;
let destroyed = false;
let capturedOptions: RequestOptions;
let socketError: NodeJS.ErrnoException | undefined;

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
    const respond = (error?: Error | null) => {
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
    };
    if (options.socketPath) queueMicrotask(() => respond(socketError));
    else options.lookup!('transactioninfo.ethiotelecom.et', {}, respond);
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
  socketError = undefined;
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
  it('uses the configured Unix socket and still checks the official Telebirr TLS name', async () => {
    const telebirrTunnelSocket = '/run/andhub-telebirr/receipt.sock';
    await expect(retrieveHtml(locator, { telebirrTunnelSocket })).resolves.toMatchObject({
      html: '<html>synthetic</html>',
    });
    expect(request).toHaveBeenCalledExactlyOnceWith(
      locator.url,
      expect.objectContaining({
        socketPath: telebirrTunnelSocket,
        servername: 'transactioninfo.ethiotelecom.et',
        rejectUnauthorized: true,
      }),
      expect.any(Function),
    );
    expect(lookup).not.toHaveBeenCalled();
  });
  it.each(['ENOENT', 'ECONNREFUSED'])(
    'reports an offline tunnel (%s) without direct fallback',
    async (code) => {
      socketError = Object.assign(new Error('private socket path'), { code });
      await expect(
        retrieveTelebirr('TEST1234AB', {
          telebirrTunnelSocket: '/run/andhub-telebirr/receipt.sock',
        }),
      ).resolves.toMatchObject({
        kind: 'UNAVAILABLE',
        code: 'PROVIDER_NETWORK_ERROR',
        stage: 'receipt_retrieval',
        retryable: true,
        details: { transportCode: 'TELEBIRR_TUNNEL_OFFLINE' },
      });
      expect(lookup).not.toHaveBeenCalled();
      expect(request).toHaveBeenCalledTimes(1);
    },
  );
  it('rejects the tunnel option for other providers and invalid socket paths', async () => {
    const cbe = normalizeReceiptLocator(
      'cbe',
      'https://mbreciept.cbe.com.et/v2-SyntheticReceipt0001',
    );
    await expect(retrieveHtml(cbe, { telebirrTunnelSocket: '/tmp/receipt.sock' })).rejects.toThrow(
      TypeError,
    );
    await expect(retrieveHtml(locator, { telebirrTunnelSocket: 'receipt.sock' })).rejects.toThrow(
      TypeError,
    );
    expect(request).not.toHaveBeenCalled();
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
      expect(await retrieveTelebirr('TEST1234AB')).toMatchObject({
        kind: 'UNAVAILABLE',
        code: 'PROVIDER_HTTP_ERROR',
      });
      expect(request).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    { 'content-type': 'application/json' },
    { 'content-type': 'text/html', 'content-encoding': 'gzip' },
  ])('rejects unexpected response metadata %#', async (headers) => {
    responseHeaders = headers;
    await expect(retrieveHtml(locator)).rejects.toMatchObject({
      code: 'INVALID_PROVIDER_RESPONSE',
    });
  });
  it('distinguishes an unexplained 404 from absence and retains bounded rate-limit details', async () => {
    responseStatus = 404;
    expect(await retrieveTelebirr('TEST1234AB')).toMatchObject({
      kind: 'UNAVAILABLE',
      code: 'PROVIDER_HTTP_ERROR',
      retryable: false,
      details: { httpStatus: 404 },
    });
    destroyed = false;
    responseStatus = 429;
    responseHeaders['retry-after'] = '120';
    expect(await retrieveTelebirr('TEST1234AB')).toMatchObject({
      kind: 'UNAVAILABLE',
      code: 'PROVIDER_RATE_LIMITED',
      retryable: true,
      details: { httpStatus: 429, retryAfterMs: 60000 },
    });
  });
  it('enforces advertised and streamed byte bounds', async () => {
    responseHeaders['content-length'] = '100';
    await expect(retrieveHtml(locator, { maxBytes: 10 })).rejects.toMatchObject({
      code: 'RECEIPT_TOO_LARGE',
    });
    delete responseHeaders['content-length'];
    destroyed = false;
    chunks = [Buffer.from('123456'), Buffer.from('78901')];
    await expect(retrieveHtml(locator, { maxBytes: 10 })).rejects.toMatchObject({
      code: 'RECEIPT_TOO_LARGE',
    });
  });
  it('rejects empty bodies and invalid UTF-8', async () => {
    chunks = [];
    await expect(retrieveHtml(locator)).rejects.toMatchObject({
      code: 'INVALID_PROVIDER_RESPONSE',
    });
    chunks = [Buffer.from([0xff])];
    destroyed = false;
    await expect(retrieveHtml(locator)).rejects.toMatchObject({
      code: 'INVALID_PROVIDER_RESPONSE',
    });
  });
  it('enforces a total deadline and destroys the request', async () => {
    hang = true;
    expect(await retrieveTelebirr('TEST1234AB', { timeoutMs: 10 })).toMatchObject({
      kind: 'UNAVAILABLE',
      code: 'PROVIDER_TIMEOUT',
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
    try {
      await retrieveTelebirr('TEST1234AB');
      throw new Error('Expected the request setup to fail');
    } catch (error) {
      expect(error).toMatchObject({ code: 'INTERNAL_ERROR' });
      expect(JSON.stringify(error)).not.toContain('private URL');
    }
  });
  it('refuses forged locators and invalid bounds before requests', async () => {
    await expect(retrieveHtml({ ...locator, url: 'https://evil.test/' })).rejects.toMatchObject({
      code: 'INVALID_LOCATOR',
    });
    await expect(retrieveHtml(locator, { maxBytes: Infinity })).rejects.toThrow(TypeError);
    await expect(retrieveHtml(locator, { timeoutMs: 0 })).rejects.toThrow(TypeError);
    expect(request).not.toHaveBeenCalled();
  });
  it('reports malformed fetched HTML as provider unavailability', async () => {
    chunks = [Buffer.from('<span>unclosed')];
    expect(await retrieveTelebirr('TEST1234AB')).toMatchObject({
      kind: 'UNAVAILABLE',
      code: 'UNSUPPORTED_RECEIPT_FORMAT',
    });
  });
  it('retains retrieved provenance separately from saved HTML', async () => {
    chunks = [
      Buffer.from(
        '<table><tr><td>Invoice Number</td><td>TEST1234AB</td></tr><tr><td>Settled Amount</td><td>ETB 0.29</td></tr></table>',
      ),
    ];
    expect(await retrieveTelebirr('TEST1234AB')).toMatchObject({
      kind: 'EVIDENCE',
      provenance: { kind: 'OFFICIAL_HTTPS', url: locator.url, parserVersion: 'telebirr-html-5' },
      evidence: { transactionId: 'TEST1234AB' },
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

describe('receipt-free deployment preflight', () => {
  function fakeSocket(event?: 'secureConnect' | 'error', code?: string) {
    const socket = Object.assign(new EventEmitter(), { destroy: vi.fn(), write: vi.fn() });
    vi.mocked(connect).mockImplementation(() => {
      if (event)
        queueMicrotask(() => socket.emit(event, Object.assign(new Error('private'), { code })));
      return socket as unknown as TLSSocket;
    });
    return socket;
  }

  it('checks both pinned CBE hostnames without sending HTTP', async () => {
    const socket = fakeSocket('secureConnect');
    expect(await checkProviderConnectivity('cbe')).toEqual([
      { hostname: 'mbreciept.cbe.com.et', route: 'direct' },
      { hostname: 'mb.cbe.com.et', route: 'direct' },
    ]);
    const options = vi.mocked(connect).mock.calls.map(([value]) => value as ConnectionOptions);
    expect(options.map(({ servername }) => servername)).toEqual([
      'mbreciept.cbe.com.et',
      'mb.cbe.com.et',
    ]);
    expect(options[0]).toMatchObject({
      family: 4,
      port: 443,
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
      lookup: expect.any(Function),
    });
    expect(socket.destroy).toHaveBeenCalledTimes(2);
    expect(socket.write).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it('uses the Telebirr tunnel with official SNI and returns a safe offline diagnostic', async () => {
    fakeSocket('error', 'ENOENT');
    const path = '/run/test/receipt.sock';
    expect(await checkProviderConnectivity('telebirr', { telebirrTunnelSocket: path })).toEqual([
      {
        hostname: 'transactioninfo.ethiotelecom.et',
        route: 'telebirr-tunnel',
        error: {
          code: 'PROVIDER_NETWORK_ERROR',
          details: { transportCode: 'TELEBIRR_TUNNEL_OFFLINE' },
        },
      },
    ]);
    expect(connect).toHaveBeenCalledExactlyOnceWith({
      path,
      servername: 'transactioninfo.ethiotelecom.et',
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
    });
    await expect(checkProviderConnectivity('cbe', { telebirrTunnelSocket: path })).rejects.toThrow(
      TypeError,
    );
  });

  it('reports invalid provider certificates and bounds stalled handshakes', async () => {
    fakeSocket('error', 'ERR_TLS_CERT_ALTNAME_INVALID');
    expect(await checkProviderConnectivity('telebirr')).toMatchObject([
      { error: { code: 'PROVIDER_TLS_ERROR' } },
    ]);
    const stalled = fakeSocket();
    expect(await checkProviderConnectivity('telebirr', { timeoutMs: 5 })).toMatchObject([
      { error: { code: 'PROVIDER_TIMEOUT' } },
    ]);
    expect(stalled.destroy).toHaveBeenCalled();
  });
});
