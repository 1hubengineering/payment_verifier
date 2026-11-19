import { PgAsyncTransaction } from 'drizzle-orm/pg-core';
import type { PgVarcharBuilder, PgTextBuilder, PgIntegerBuilder } from 'drizzle-orm/pg-core';
import { eq, like, asc, is } from 'drizzle-orm';
import type { AnyRelations } from 'drizzle-orm/relations';
import { pgTable, varchar, text, integer } from 'drizzle-orm/pg-core';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
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
  typeof pgTable<
    'receipt_verifier_records',
    {
      recordKey: ReturnType<PgVarcharBuilder['primaryKey']>;
      payload: ReturnType<PgTextBuilder['notNull']>;
    }
  >
> = pgTable('receipt_verifier_records', {
  recordKey: varchar('record_key', { length: 96 }).primaryKey(),
  payload: text('payload').notNull(),
});
export const receiptVerifierSchema: ReturnType<
  typeof pgTable<
    'receipt_verifier_schema',
    {
      id: ReturnType<PgIntegerBuilder['primaryKey']>;
      version: ReturnType<PgIntegerBuilder['notNull']>;
    }
  >
> = pgTable('receipt_verifier_schema', {
  id: integer('id').primaryKey(),
  version: integer('version').notNull(),
});
type Tx<T extends AnyRelations> = Parameters<Parameters<NodePgDatabase<T>['transaction']>[0]>[0];
function records<T extends AnyRelations>(
  db: NodePgDatabase<T> | Tx<T>,
  lock: boolean,
): RecordTransaction {
  const get: RecordTransaction['get'] = async (key) => {
    validateStorageKey(key);
    const query = db
      .select()
      .from(receiptVerifierRecords)
      .where(eq(receiptVerifierRecords.recordKey, key))
      .limit(1);
    const rows = await (lock ? query.for('update') : query);
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
      const rows = await (lock ? query.for('update') : query);
      return rows.map((r) => ({ key: r.recordKey, value: decodeStorageRecord(r.payload) }));
    },
  };
}
export function drizzlePostgresStorage<T extends AnyRelations>(
  database: NodePgDatabase<T>,
): VerificationStorage {
  return drizzleStore(
    (key) => records(database, false).get(key),
    (work) =>
      database.transaction((tx) => work(records(tx, true)), { isolationLevel: 'serializable' }),
    false,
  );
}
export function drizzlePostgresTransaction<T extends AnyRelations>(
  transaction: Tx<T>,
): VerificationStorage {
  if (!is(transaction, PgAsyncTransaction))
    throw new TypeError('Expected a caller-owned Drizzle transaction');
  return drizzleStore(
    (key) => records(transaction, true).get(key),
    (work) => work(records(transaction, true)),
    true,
  );
}
