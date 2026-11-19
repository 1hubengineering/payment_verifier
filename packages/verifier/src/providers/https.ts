import { lookup } from 'node:dns';
import { request } from 'node:https';
import { BlockList, isIPv4 } from 'node:net';
import type { LookupFunction } from 'node:net';
import { posix } from 'node:path';
import { RECEIPT_MAX_BYTES } from './extraction.ts';
import { outboundLocator } from './locator.ts';
import type { ReceiptLocator } from './locator.ts';

import type { DiagnosticDetails, ProviderFailureCode } from '../outcomes.ts';

export type RetrievalErrorCode = ProviderFailureCode | 'INVALID_LOCATOR' | 'CANCELLED';
export class RetrievalError extends Error {
  constructor(
    readonly code: RetrievalErrorCode,
    readonly details: DiagnosticDetails = {},
    readonly retryable = false,
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = 'RetrievalError';
  }
}
export interface RetrievalOptions {
  readonly timeoutMs?: number;
  readonly maxBytes?: number;
  readonly signal?: AbortSignal;
  /** Host-configured Unix socket forwarding only to the official Telebirr endpoint. */
  readonly telebirrTunnelSocket?: string;
}
export interface RetrievedHtml {
  readonly html: string;
  readonly bytes: number;
}

const blocked = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 3],
] as const)
  blocked.addSubnet(network, prefix, 'ipv4');

/** Conservative IPv4-only policy; IPv6 and private and reserved IPv4 ranges fail closed. */
export function isPublicDestination(address: string): boolean {
  return isIPv4(address) && !blocked.check(address, 'ipv4');
}
const publicLookup: LookupFunction = (hostname, _options, callback) => {
  lookup(hostname, { family: 4, all: true, verbatim: true }, (error, addresses) => {
    if (error) {
      callback(
        new RetrievalError(
          'PROVIDER_DNS_ERROR',
          transportDetails(error.code),
          error.code === 'EAI_AGAIN',
          { cause: error },
        ),
        '',
        4,
      );
      return;
    }
    if (!addresses.length || addresses.some((a) => !isPublicDestination(a.address))) {
      callback(new RetrievalError('DESTINATION_BLOCKED'), '', 4);
      return;
    }
    callback(null, addresses[0]!.address, 4);
  });
};

const transientNetworkCodes = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'EPIPE',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
]);
const tlsCodes = new Set([
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
]);
function transportDetails(code: unknown): DiagnosticDetails {
  return typeof code === 'string' && /^[A-Z][A-Z0-9_]{1,47}$/.test(code)
    ? { transportCode: code }
    : {};
}
function transportFailure(error: Error, throughTunnel: boolean): RetrievalError {
  if (error instanceof RetrievalError) return error;
  const code = (error as NodeJS.ErrnoException).code;
  if (throughTunnel && (code === 'ENOENT' || code === 'ECONNREFUSED'))
    return new RetrievalError(
      'PROVIDER_NETWORK_ERROR',
      { transportCode: 'TELEBIRR_TUNNEL_OFFLINE' },
      true,
      { cause: error },
    );
  const tls = code !== undefined && (tlsCodes.has(code) || /^ERR_(?:TLS|SSL)_/.test(code));
  return new RetrievalError(
    tls ? 'PROVIDER_TLS_ERROR' : 'PROVIDER_NETWORK_ERROR',
    transportDetails(code),
    code !== undefined && transientNetworkCodes.has(code),
    { cause: error },
  );
}

function retryAfter(value: string | undefined): number | undefined {
  if (!value || value.length > 64) return undefined;
  const delay = /^\d{1,10}$/.test(value)
    ? Number(value) * 1000
    : /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(value)
      ? Date.parse(value) - Date.now()
      : NaN;
  return Number.isFinite(delay) && delay >= 0 ? Math.min(delay, 60_000) : undefined;
}

/** HTTPS only, with TLS verification and no redirects. Direct connections pin checked DNS. */
export async function retrieveHtml(
  locator: ReceiptLocator,
  options: RetrievalOptions = {},
): Promise<RetrievedHtml> {
  let normalized: ReceiptLocator;
  try {
    normalized = outboundLocator(locator.provider, locator.url);
  } catch {
    throw new RetrievalError('INVALID_LOCATOR');
  }
  const socketPath = options.telebirrTunnelSocket;
  if (
    socketPath !== undefined &&
    (normalized.provider !== 'telebirr' ||
      !posix.isAbsolute(socketPath) ||
      socketPath.includes('\0') ||
      Buffer.byteLength(socketPath) > 100)
  )
    throw new TypeError('Invalid Telebirr tunnel socket');
  const timeoutMs = options.timeoutMs ?? 15_000,
    maxBytes = options.maxBytes ?? RECEIPT_MAX_BYTES;
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 60_000 ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > RECEIPT_MAX_BYTES
  )
    throw new TypeError('Invalid retrieval bounds');
  if (options.signal?.aborted) throw new RetrievalError('CANCELLED');
  return new Promise((resolve, reject) => {
    let completed = false;
    const finish = (error?: RetrievalError, value?: RetrievedHtml): void => {
      if (completed) return;
      completed = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', cancel);
      if (error) reject(error);
      else resolve(value!);
    };
    const req = request(
      normalized.url,
      {
        method: 'GET',
        agent: false,
        ...(socketPath
          ? { socketPath, servername: new URL(normalized.url).hostname }
          : { family: 4, lookup: publicLookup }),
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
        maxHeaderSize: 16_384,
        headers: { accept: 'text/html', 'accept-encoding': 'identity' },
      },
      (res) => {
        const fail = (
          code: RetrievalErrorCode,
          details: DiagnosticDetails = {},
          retryable = false,
        ): void => {
          finish(new RetrievalError(code, details, retryable));
          res.destroy();
          req.destroy();
        };
        if (res.statusCode !== 200) {
          const httpStatus = res.statusCode;
          if (httpStatus === undefined) fail('INVALID_PROVIDER_RESPONSE');
          else if (httpStatus === 429) {
            const retryAfterMs = retryAfter(res.headers['retry-after']);
            fail(
              'PROVIDER_RATE_LIMITED',
              { httpStatus, ...(retryAfterMs === undefined ? {} : { retryAfterMs }) },
              true,
            );
          } else
            fail('PROVIDER_HTTP_ERROR', { httpStatus }, [408, 502, 503, 504].includes(httpStatus));
          return;
        }
        if (
          !/^text\/html(?:\s*;|\s*$)/i.test(res.headers['content-type'] ?? '') ||
          (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity')
        ) {
          fail('INVALID_PROVIDER_RESPONSE');
          return;
        }
        const length = res.headers['content-length'];
        if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > maxBytes)) {
          fail('RECEIPT_TOO_LARGE');
          return;
        }
        const chunks: Buffer[] = [];
        let total = 0;
        res.on('data', (chunk: Buffer) => {
          if (completed) return;
          total += chunk.length;
          if (total > maxBytes) {
            fail('RECEIPT_TOO_LARGE');
            return;
          }
          chunks.push(chunk);
        });
        res.on('error', (error) => finish(transportFailure(error, socketPath !== undefined)));
        res.on('end', () => {
          if (total === 0) {
            fail('INVALID_PROVIDER_RESPONSE');
            return;
          }
          try {
            const html = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
            finish(undefined, { html, bytes: total });
          } catch {
            fail('INVALID_PROVIDER_RESPONSE');
          }
        });
      },
    );
    const cancel = (): void => {
      finish(new RetrievalError('CANCELLED'));
      req.destroy();
    };
    const timer = setTimeout(() => {
      finish(new RetrievalError('PROVIDER_TIMEOUT', { timeoutMs }, true));
      req.destroy();
    }, timeoutMs);
    options.signal?.addEventListener('abort', cancel, { once: true });
    req.on('error', (error: Error) => finish(transportFailure(error, socketPath !== undefined)));
    req.end();
  });
}
