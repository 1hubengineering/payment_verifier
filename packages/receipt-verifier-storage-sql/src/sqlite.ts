import { Kysely, SqliteDialect } from 'kysely';
import type { Database } from 'better-sqlite3';
import { createStorage } from './storage.ts';
import type { SqlStorage, StorageSchema } from './index.ts';
import type { VerificationStorage } from '@andhub/receipt-verifier';

export function sqliteStorage(database: Database): SqlStorage {
  return createStorage(
    new Kysely<StorageSchema>({ dialect: new SqliteDialect({ database }) }),
    'sqlite',
  );
}
/** The caller has already begun a transaction on this exact SQLite connection. */
export function sqliteTransaction(database: Database): VerificationStorage {
  return createStorage(
    new Kysely<StorageSchema>({ dialect: new SqliteDialect({ database }) }),
    'sqlite',
    true,
  );
}
