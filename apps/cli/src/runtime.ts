import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { sqliteStorage } from '@1hubengineering/receipt-verifier-storage-sql/sqlite';
import { createReceiptVerifier } from '@1hubengineering/receipt-verifier';
import type { ReceiptProvider, ReceiptVerifier } from '@1hubengineering/receipt-verifier';
import type { SqlStorage } from '@1hubengineering/receipt-verifier-storage-sql';
import { createDurableVerifier } from '@1hubengineering/receipt-verifier/jobs';
import type { DurableVerifier } from '@1hubengineering/receipt-verifier/jobs';
import { retrieveTelebirr } from '@1hubengineering/receipt-verifier/providers';

export interface OperatorConfiguration {
  readonly RECEIPT_TIMEOUT_MS: number;
  readonly RECEIPT_DATABASE_FILE?: string | undefined;
  readonly RECEIPT_JOB_KEY?: string | undefined;
  readonly RECEIPT_ALLOW_PROVIDER_TRAFFIC: boolean;
  readonly RECEIPT_ENABLE_CBE: boolean;
}
export interface OperatorRuntime {
  storage: SqlStorage;
  verifier: ReceiptVerifier;
  jobs: DurableVerifier | undefined;
  close(): void;
}
export class OperatorError extends Error {
  readonly code: 'INVALID_INPUT' | 'INVALID_FILE' | 'QUEUE_KEY_REQUIRED';
  constructor(code: OperatorError['code']) {
    super(code);
    this.code = code;
    this.name = 'OperatorError';
  }
}
/** Private application boundary: this process explicitly owns only the handle it opens. */
export async function openOperatorRuntime(
  config: OperatorConfiguration,
  withJobs = false,
): Promise<OperatorRuntime> {
  const timeoutMs = config.RECEIPT_TIMEOUT_MS;
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 60000 ||
    typeof config.RECEIPT_ALLOW_PROVIDER_TRAFFIC !== 'boolean' ||
    typeof config.RECEIPT_ENABLE_CBE !== 'boolean'
  )
    throw new OperatorError('INVALID_INPUT');
  const key = config.RECEIPT_JOB_KEY;
  if (withJobs && (!key || !/^[a-f0-9]{64}$/iu.test(key)))
    throw new OperatorError('QUEUE_KEY_REQUIRED');
  const providers: { telebirr?: ReceiptProvider; cbe?: ReceiptProvider } = {};
  if (config.RECEIPT_ALLOW_PROVIDER_TRAFFIC) {
    providers.telebirr = {
      retrieve: (url, options) => retrieveTelebirr(url, { ...options, timeoutMs }),
    };
    if (config.RECEIPT_ENABLE_CBE) {
      const { createCbeProvider } = await import('@1hubengineering/receipt-verifier-provider-cbe');
      providers.cbe = createCbeProvider({ maxConcurrency: 1 });
    }
  }
  const filename =
    config.RECEIPT_DATABASE_FILE ??
    fileURLToPath(new URL('../../../.receipt-state.sqlite', import.meta.url));
  const database = new Database(filename, { timeout: 5000 });
  try {
    database.pragma('journal_mode = WAL');
    const storage = sqliteStorage(database);
    await storage.migrate();
    const verifier = createReceiptVerifier({ storage, providers });
    const jobs = withJobs
      ? createDurableVerifier({
          storage,
          providers,
          encryptionKey: Buffer.from(key!, 'hex'),
          policy: { timeoutMs, leaseMs: Math.max(30000, timeoutMs + 1000) },
        })
      : undefined;
    if (jobs) await jobs.initialize();
    return { storage, verifier, jobs, close: () => database.close() };
  } catch (error) {
    database.close();
    throw error;
  }
}
