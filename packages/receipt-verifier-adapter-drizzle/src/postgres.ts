import { PgTransaction } from 'drizzle-orm/pg-core';
import type {
  PgVarcharBuilderInitial,
  PgTextBuilderInitial,
  PgIntegerBuilderInitial,
} from 'drizzle-orm/pg-core';
import { eq, like, asc, is } from 'drizzle-orm';
import { pgTable, varchar, text, integer } from 'drizzle-orm/pg-core';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { RecordTransaction, VerificationStorage } from '@1hubengineering/receipt-verifier';
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
      recordKey: ReturnType<
        PgVarcharBuilderInitial<'record_key', [string, ...string[]], 96>['primaryKey']
      >;
      payload: ReturnType<PgTextBuilderInitial<'payload', [string, ...string[]]>['notNull']>;
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
      id: ReturnType<PgIntegerBuilderInitial<'id'>['primaryKey']>;
      version: ReturnType<PgIntegerBuilderInitial<'version'>['notNull']>;
    }
  >
> = pgTable('receipt_verifier_schema', {
  id: integer('id').primaryKey(),
  version: integer('version').notNull(),
});
type Schema = Record<string, unknown>;
type Tx<T extends Schema> = Parameters<Parameters<NodePgDatabase<T>['transaction']>[0]>[0];
function records<T extends Schema>(
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
export function drizzlePostgresStorage<T extends Schema>(
  database: NodePgDatabase<T>,
): VerificationStorage {
  return drizzleStore(
    (key) => records(database, false).get(key),
    (work) =>
      database.transaction((tx) => work(records(tx, true)), { isolationLevel: 'serializable' }),
    false,
  );
}
export function drizzlePostgresTransaction<T extends Schema>(
  transaction: Tx<T>,
): VerificationStorage {
  if (!is(transaction, PgTransaction))
    throw new TypeError('Expected a caller-owned Drizzle transaction');
  return drizzleStore(
    (key) => records(transaction, true).get(key),
    (work) => work(records(transaction, true)),
    true,
  );
}
