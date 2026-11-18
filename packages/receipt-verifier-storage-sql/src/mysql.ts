import { Kysely, MysqlDialect } from 'kysely';
import type { Pool, PoolConnection } from 'mysql2';
import { createStorage } from './storage.ts';
import type { SqlStorage, StorageSchema } from './index.ts';
import type { VerificationStorage } from '@1hubengineering/receipt-verifier';

export function mysqlStorage(pool: Pool): SqlStorage {
  return createStorage(new Kysely<StorageSchema>({ dialect: new MysqlDialect({ pool }) }), 'mysql');
}
/** The caller has already begun a transaction on this exact callback-style connection. */
export function mysqlTransaction(connection: PoolConnection): VerificationStorage {
  const pool = {
    getConnection(callback: (error: Error | null, connection: PoolConnection) => void) {
      const wrapper = Object.create(connection) as PoolConnection;
      wrapper.query = connection.query.bind(connection);
      wrapper.release = () => {};
      callback(null, wrapper);
    },
    end(callback: (error: Error | null) => void) {
      callback(null);
    },
  };
  return createStorage(
    new Kysely<StorageSchema>({ dialect: new MysqlDialect({ pool }) }),
    'mysql',
    true,
  );
}
