import { MySqlTransaction } from 'drizzle-orm/mysql-core';
import type {
  MySqlVarCharBuilderInitial,
  MySqlTextBuilderInitial,
  MySqlIntBuilderInitial,
} from 'drizzle-orm/mysql-core';
import { eq, like, asc, is } from 'drizzle-orm';
import { mysqlTable, varchar, text, int } from 'drizzle-orm/mysql-core';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import type { RecordTransaction, VerificationStorage } from '@andhub/receipt-verifier';
import {
  drizzleStore,
  StorageDataError,
  validateStorageKey,
  validateStorageScan,
  encodeStorageRecord,
  decodeStorageRecord,
} from './common.ts';

export const receiptVerifierRecords: ReturnType<
  typeof mysqlTable<
    'receipt_verifier_records',
    {
      recordKey: ReturnType<
        MySqlVarCharBuilderInitial<'record_key', [string, ...string[]], 96>['primaryKey']
      >;
      payload: ReturnType<MySqlTextBuilderInitial<'payload', [string, ...string[]]>['notNull']>;
    }
  >
> = mysqlTable('receipt_verifier_records', {
  recordKey: varchar('record_key', { length: 96 }).primaryKey(),
  payload: text('payload').notNull(),
});
export const receiptVerifierSchema: ReturnType<
  typeof mysqlTable<
    'receipt_verifier_schema',
    {
      id: ReturnType<MySqlIntBuilderInitial<'id'>['primaryKey']>;
      version: ReturnType<MySqlIntBuilderInitial<'version'>['notNull']>;
    }
  >
> = mysqlTable('receipt_verifier_schema', {
  id: int('id').primaryKey(),
  version: int('version').notNull(),
});
type Schema = Record<string, unknown>;
type Tx<T extends Schema> = Parameters<Parameters<MySql2Database<T>['transaction']>[0]>[0];
function records<T extends Schema>(
  db: MySql2Database<T> | Tx<T>,
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
      if ((await get(key)) === undefined) throw new StorageDataError();
      const [updated] = await db
        .update(receiptVerifierRecords)
        .set({ payload: encodeStorageRecord(value) })
        .where(eq(receiptVerifierRecords.recordKey, key));
      if (updated.affectedRows !== 1) throw new StorageDataError();
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
export function drizzleMysqlStorage<T extends Schema>(
  database: MySql2Database<T>,
): VerificationStorage {
  return drizzleStore(
    (key) => records(database, false).get(key),
    (work) =>
      database.transaction((tx) => work(records(tx, true)), { isolationLevel: 'serializable' }),
    false,
  );
}
export function drizzleMysqlTransaction<T extends Schema>(transaction: Tx<T>): VerificationStorage {
  if (!is(transaction, MySqlTransaction))
    throw new TypeError('Expected a caller-owned Drizzle transaction');
  return drizzleStore(
    (key) => records(transaction, true).get(key),
    (work) => work(records(transaction, true)),
    true,
  );
}
