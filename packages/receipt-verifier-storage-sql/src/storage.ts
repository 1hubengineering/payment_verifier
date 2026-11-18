import {
  StorageDataError,
  validateStorageKey as validateKey,
  validateStorageScan,
  encodeStorageRecord as encode,
  decodeStorageRecord as decode,
} from '@1hubengineering/receipt-verifier/storage';
export { StorageDataError } from '@1hubengineering/receipt-verifier/storage';
import type { Kysely } from 'kysely';
import { StorageConflict } from '@1hubengineering/receipt-verifier';
import type {
  RecordTransaction,
  StoredRecord,
  VerificationStorage,
} from '@1hubengineering/receipt-verifier';

export interface StorageSchema {
  receipt_verifier_records: { record_key: string; payload: string };
  receipt_verifier_schema: { id: number; version: number };
}
export type SqlEngine = 'postgres' | 'mysql' | 'sqlite';
export interface SqlStorage extends VerificationStorage {
  /** Apply v1 schema explicitly; no import-time migration or connection ownership. */
  migrate(): Promise<void>;
  /** Use the caller's actual Kysely transaction; caller owns commit, rollback and retry. */
  withTransaction(transaction: Kysely<StorageSchema>): VerificationStorage;
}
export function isSqlConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  return (
    typeof code === 'string' &&
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
    ].includes(code)
  );
}
function transactionRecords(db: Kysely<StorageSchema>, engine: SqlEngine): RecordTransaction {
  return {
    async get(key) {
      validateKey(key);
      let query = db
        .selectFrom('receipt_verifier_records')
        .select('payload')
        .where('record_key', '=', key);
      if (engine !== 'sqlite') query = query.forUpdate();
      return decode((await query.executeTakeFirst())?.payload);
    },
    async insert(key, value) {
      validateKey(key);
      await db
        .insertInto('receipt_verifier_records')
        .values({ record_key: key, payload: encode(value) })
        .execute();
    },
    async set(key, value) {
      validateKey(key);
      const updated = await db
        .updateTable('receipt_verifier_records')
        .set({ payload: encode(value) })
        .where('record_key', '=', key)
        .executeTakeFirst();
      if (updated.numUpdatedRows !== 1n) throw new StorageDataError();
    },
    async delete(key) {
      validateKey(key);
      await db.deleteFrom('receipt_verifier_records').where('record_key', '=', key).execute();
    },
    async scan(prefix, limit): Promise<readonly StoredRecord[]> {
      validateStorageScan(prefix, limit);
      let query = db
        .selectFrom('receipt_verifier_records')
        .selectAll()
        .where('record_key', 'like', `${prefix}%`)
        .orderBy('record_key')
        .limit(limit);
      if (engine !== 'sqlite') query = query.forUpdate();
      return (await query.execute()).map((row) => ({
        key: row.record_key,
        value: decode(row.payload),
      }));
    },
  };
}

/** The Kysely handle and its underlying pool remain caller-owned; never destroy them here. */
export function createStorage(
  db: Kysely<StorageSchema>,
  engine: SqlEngine,
  scoped = false,
): SqlStorage {
  if (!['postgres', 'mysql', 'sqlite'].includes(engine)) throw new TypeError('Invalid SQL engine');
  const transactionScoped = scoped || db.isTransaction;
  const storage: SqlStorage = {
    callerTransaction: transactionScoped,
    async read(key) {
      validateKey(key);
      return decode(
        (
          await db
            .selectFrom('receipt_verifier_records')
            .select('payload')
            .where('record_key', '=', key)
            .executeTakeFirst()
        )?.payload,
      );
    },
    async transaction(work) {
      if (transactionScoped) {
        try {
          return await work(transactionRecords(db, engine));
        } catch (error) {
          if (isSqlConflict(error)) throw new StorageConflict();
          throw error;
        }
      }
      for (let attempt = 0; ; attempt++) {
        try {
          const builder = db.transaction();
          const transaction =
            engine === 'sqlite' ? builder : builder.setIsolationLevel('serializable');
          return await transaction.execute((tx) => work(transactionRecords(tx, engine)));
        } catch (error) {
          if (!isSqlConflict(error)) throw error;
          if (attempt >= 7) throw new StorageConflict();
          await new Promise<void>((resolve) => setTimeout(resolve, (attempt + 1) * 5));
        }
      }
    },
    async migrate() {
      if (transactionScoped) throw new StorageDataError();
      // MySQL DDL commits implicitly. Each step is restartable; run one migration owner.
      await db.schema
        .createTable('receipt_verifier_schema')
        .ifNotExists()
        .addColumn('id', 'integer', (c) => c.primaryKey())
        .addColumn('version', 'integer', (c) => c.notNull())
        .execute();
      const metadata = await db.selectFrom('receipt_verifier_schema').selectAll().execute();
      if (
        metadata.length > 1 ||
        (metadata.length === 1 && (metadata[0]!.id !== 1 || metadata[0]!.version !== 1))
      )
        throw new StorageDataError();
      await db.schema
        .createTable('receipt_verifier_records')
        .ifNotExists()
        .addColumn('record_key', 'varchar(96)', (c) => c.primaryKey())
        .addColumn('payload', 'text', (c) => c.notNull())
        .execute();
      if (!metadata.length)
        await db.insertInto('receipt_verifier_schema').values({ id: 1, version: 1 }).execute();
      // Validate expected columns even for an existing v1 installation.
      await db
        .selectFrom('receipt_verifier_records')
        .select(['record_key', 'payload'])
        .limit(1)
        .execute();
      // Verify primary-key uniqueness without leaving a probe or trusting metadata alone.
      const probe = { record_key: `rv1:schema:${'0'.repeat(64)}`, payload: '{}' };
      try {
        await db.transaction().execute(async (tx) => {
          await tx.insertInto('receipt_verifier_records').values(probe).execute();
          await tx.insertInto('receipt_verifier_records').values(probe).execute();
          throw new StorageDataError();
        });
      } catch (error) {
        const code =
          error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined;
        if (
          ![
            '23505',
            'ER_DUP_ENTRY',
            'SQLITE_CONSTRAINT_PRIMARYKEY',
            'SQLITE_CONSTRAINT_UNIQUE',
          ].includes(code as string)
        )
          throw error;
      }
    },
    withTransaction(transaction) {
      if (!transaction.isTransaction) throw new TypeError('Expected a caller-owned transaction');
      return createStorage(transaction, engine, true);
    },
  };
  return storage;
}
