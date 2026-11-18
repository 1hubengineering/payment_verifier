import { lookup } from 'node:dns';
import { request } from 'node:https';
import { BlockList, isIPv4 } from 'node:net';
import type { LookupFunction } from 'node:net';
import { RECEIPT_MAX_BYTES } from './extraction.ts';
import { normalizeReceiptLocator } from './locator.ts';
import type { ReceiptLocator } from './locator.ts';

export type RetrievalErrorCode =
  | 'INVALID_LOCATOR'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'DESTINATION_BLOCKED'
  | 'PROVIDER_UNAVAILABLE'
  | 'INVALID_RESPONSE'
  | 'TOO_LARGE';
export class RetrievalError extends Error {
  readonly code: RetrievalErrorCode;
  constructor(code: RetrievalErrorCode) {
    super(code);
    this.name = 'RetrievalError';
    this.code = code;
  }
}
export interface RetrievalOptions {
  readonly timeoutMs?: number;
  readonly maxBytes?: number;
  readonly signal?: AbortSignal;
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
      callback(new RetrievalError('PROVIDER_UNAVAILABLE'), '', 4);
      return;
    }
    if (!addresses.length || addresses.some((a) => !isPublicDestination(a.address))) {
      callback(new RetrievalError('DESTINATION_BLOCKED'), '', 4);
      return;
    }
    callback(null, addresses[0]!.address, 4);
  });
};

/** HTTPS only, with DNS checked in the socket lookup, TLS verification and no redirects/proxies. */
export async function retrieveHtml(
  locator: ReceiptLocator,
  options: RetrievalOptions = {},
): Promise<RetrievedHtml> {
  let normalized: ReceiptLocator;
  try {
    normalized = normalizeReceiptLocator(locator.provider, locator.url);
  } catch {
    throw new RetrievalError('INVALID_LOCATOR');
  }
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
        family: 4,
        lookup: publicLookup,
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
        maxHeaderSize: 16_384,
        headers: { accept: 'text/html', 'accept-encoding': 'identity' },
      },
      (res) => {
        const fail = (code: RetrievalErrorCode): void => {
          finish(new RetrievalError(code));
          res.destroy();
          req.destroy();
        };
        if (res.statusCode !== 200) {
          fail('PROVIDER_UNAVAILABLE');
          return;
        }
        if (
          !/^text\/html(?:\s*;|\s*$)/i.test(res.headers['content-type'] ?? '') ||
          (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity')
        ) {
          fail('INVALID_RESPONSE');
          return;
        }
        const length = res.headers['content-length'];
        if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > maxBytes)) {
          fail('TOO_LARGE');
          return;
        }
        const chunks: Buffer[] = [];
        let total = 0;
        res.on('data', (chunk: Buffer) => {
          if (completed) return;
          total += chunk.length;
          if (total > maxBytes) {
            fail('TOO_LARGE');
            return;
          }
          chunks.push(chunk);
        });
        res.on('error', () => finish(new RetrievalError('PROVIDER_UNAVAILABLE')));
        res.on('end', () => {
          if (total === 0) {
            fail('INVALID_RESPONSE');
            return;
          }
          try {
            const html = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
            finish(undefined, { html, bytes: total });
          } catch {
            fail('INVALID_RESPONSE');
          }
        });
      },
    );
    const cancel = (): void => {
      finish(new RetrievalError('CANCELLED'));
      req.destroy();
    };
    const timer = setTimeout(() => {
      finish(new RetrievalError('TIMEOUT'));
      req.destroy();
    }, timeoutMs);
    options.signal?.addEventListener('abort', cancel, { once: true });
    req.on('error', (error: Error) =>
      finish(error instanceof RetrievalError ? error : new RetrievalError('PROVIDER_UNAVAILABLE')),
    );
    req.end();
  });
}
