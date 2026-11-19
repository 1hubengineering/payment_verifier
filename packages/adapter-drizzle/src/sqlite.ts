import { SQLiteAsyncTransaction } from 'drizzle-orm/sqlite-core';
import type { SQLiteTextBuilder, SQLiteIntegerBuilder } from 'drizzle-orm/sqlite-core';
import { eq, like, asc, is } from 'drizzle-orm';
import type { AnyRelations } from 'drizzle-orm/relations';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import type { RecordTransaction, VerificationStorage } from '@1hubengineering/verifier';
import {
  drizzleStore,
  StorageDataError,
  validateStorageKey,
  validateStorageScan,
  encodeStorageRecord,
  decodeStorageRecord,
} from './common.ts';

export const receiptVerifierRecords: ReturnType<
  typeof sqliteTable<
    'receipt_verifier_records',
    {
      recordKey: ReturnType<SQLiteTextBuilder<[string, ...string[]]>['primaryKey']>;
      payload: ReturnType<SQLiteTextBuilder<[string, ...string[]]>['notNull']>;
    }
  >
> = sqliteTable('receipt_verifier_records', {
  recordKey: text('record_key').primaryKey(),
  payload: text('payload').notNull(),
});
export const receiptVerifierSchema: ReturnType<
  typeof sqliteTable<
    'receipt_verifier_schema',
    {
      id: ReturnType<SQLiteIntegerBuilder['primaryKey']>;
      version: ReturnType<SQLiteIntegerBuilder['notNull']>;
    }
  >
> = sqliteTable('receipt_verifier_schema', {
  id: integer('id').primaryKey(),
  version: integer('version').notNull(),
});
type Tx<T extends AnyRelations> = Parameters<Parameters<LibSQLDatabase<T>['transaction']>[0]>[0];
function records<T extends AnyRelations>(db: LibSQLDatabase<T> | Tx<T>): RecordTransaction {
  const get: RecordTransaction['get'] = async (key) => {
    validateStorageKey(key);
    const query = db
      .select()
      .from(receiptVerifierRecords)
      .where(eq(receiptVerifierRecords.recordKey, key))
      .limit(1);
    const rows = await query;
    return decodeStorageRecord(rows[0]?.payload);
  };
  return {
    get,
    async insert(key, value) {
      validateStorageKey(key);
      await db
        .insert(receiptVerifierRecords)
        .values({ recordKey: key, payload: encodeStorageRecord(value) });
    },
    async set(key, value) {
      validateStorageKey(key);
      const rows = await db
        .update(receiptVerifierRecords)
        .set({ payload: encodeStorageRecord(value) })
        .where(eq(receiptVerifierRecords.recordKey, key))
        .returning({ key: receiptVerifierRecords.recordKey });
      if (rows.length !== 1) throw new StorageDataError();
    },
    async delete(key) {
      validateStorageKey(key);
      await db.delete(receiptVerifierRecords).where(eq(receiptVerifierRecords.recordKey, key));
    },
    async scan(prefix, limit) {
      validateStorageScan(prefix, limit);
      const query = db
        .select()
        .from(receiptVerifierRecords)
        .where(like(receiptVerifierRecords.recordKey, `${prefix}%`))
        .orderBy(asc(receiptVerifierRecords.recordKey))
        .limit(limit);
      const rows = await query;
      return rows.map((r) => ({ key: r.recordKey, value: decodeStorageRecord(r.payload) }));
    },
  };
}
export function drizzleSqliteStorage<T extends AnyRelations>(
  database: LibSQLDatabase<T>,
): VerificationStorage {
  return drizzleStore(
    (key) => records(database).get(key),
    (work) => database.transaction((tx) => work(records(tx))),
    false,
  );
}
export function drizzleSqliteTransaction<T extends AnyRelations>(
  transaction: Tx<T>,
): VerificationStorage {
  if (!is(transaction, SQLiteAsyncTransaction))
    throw new TypeError('Expected a caller-owned Drizzle transaction');
  return drizzleStore(
    (key) => records(transaction).get(key),
    (work) => work(records(transaction)),
    true,
  );
}
