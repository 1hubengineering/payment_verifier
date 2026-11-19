import { StorageConflict } from '@1hubengineering/verifier';
import type { RecordTransaction, VerificationStorage } from '@1hubengineering/verifier';
export {
  StorageDataError,
  validateStorageKey,
  validateStorageScan,
  encodeStorageRecord,
  decodeStorageRecord,
} from '@1hubengineering/verifier/storage';

function conflict(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth++) {
    const v = current as { code?: unknown; cause?: unknown };
    if (
      typeof v.code === 'string' &&
      [
        '40001',
        '40P01',
        '23505',
        'ER_DUP_ENTRY',
        'ER_LOCK_DEADLOCK',
        'ER_LOCK_WAIT_TIMEOUT',
        'SQLITE_BUSY',
        'SQLITE_BUSY_SNAPSHOT',
        'SQLITE_LOCKED',
        'SQLITE_CONSTRAINT_PRIMARYKEY',
        'SQLITE_CONSTRAINT_UNIQUE',
      ].includes(v.code)
    )
      return true;
    current = v.cause;
  }
  return false;
}
export function drizzleStore(
  read: VerificationStorage['read'],
  run: <T>(work: (transaction: RecordTransaction) => Promise<T>) => Promise<T>,
  callerTransaction: boolean,
): VerificationStorage {
  return {
    callerTransaction,
    read,
    async transaction(work) {
      for (let attempt = 0; ; attempt++) {
        try {
          return await run(work);
        } catch (error) {
          if (!conflict(error)) throw error;
          if (callerTransaction || attempt >= 7) throw new StorageConflict();
          await new Promise<void>((resolve) => setTimeout(resolve, (attempt + 1) * 5));
        }
      }
    },
  };
}
