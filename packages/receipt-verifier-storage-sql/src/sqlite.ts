import { Kysely, SqliteDialect } from 'kysely';
import type { Database } from 'better-sqlite3';
import { createStorage } from './storage.ts';
import type { SqlStorage, StorageSchema } from './index.ts';
import type { VerificationStorage } from '@1hubengineering/verifier';

export function sqliteStorage(database: Database): SqlStorage {
  return createStorage(
    new Kysely<StorageSchema>({ dialect: new SqliteDialect({ database }) }),
    'sqlite',
  );
}
/** The caller has already begun a transaction on this exact SQLite connection. */
export function sqliteTransaction(database: Database): VerificationStorage {
  const active = (): void => {
    if (!database.open || !database.inTransaction)
      throw new TypeError('Expected an active caller-owned SQLite transaction');
  };
  active();
  const scoped = createStorage(
    new Kysely<StorageSchema>({ dialect: new SqliteDialect({ database }) }),
    'sqlite',
    true,
  );
  return {
    callerTransaction: true,
    async read(key) {
      active();
      return scoped.read(key);
    },
    async transaction(work) {
      active();
      return scoped.transaction(work);
    },
  };
}
