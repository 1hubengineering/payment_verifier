import type { Kysely } from 'kysely';
import { createStorage } from './storage.ts';
import type { SqlEngine, SqlStorage, StorageSchema } from './storage.ts';
export { StorageDataError, isSqlConflict } from './storage.ts';
export type { SqlEngine, SqlStorage, StorageSchema } from './storage.ts';
export function createSqlStorage(database: Kysely<StorageSchema>, engine: SqlEngine): SqlStorage {
  return createStorage(database, engine);
}
