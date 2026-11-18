import { Kysely, PostgresDialect } from 'kysely';
import type { Pool, PoolClient } from 'pg';
import { createStorage } from './storage.ts';
import type { SqlStorage, StorageSchema } from './index.ts';
import type { VerificationStorage } from '@1hubengineering/verifier';

export function postgresStorage(pool: Pool): SqlStorage {
  return createStorage(
    new Kysely<StorageSchema>({ dialect: new PostgresDialect({ pool }) }),
    'postgres',
  );
}
/** The caller has already begun a transaction on this exact client. */
export function postgresTransaction(client: PoolClient): VerificationStorage {
  const pool = {
    options: {},
    connect: async () => ({ query: client.query.bind(client), release: () => {} }),
    end: async () => {},
  };
  return createStorage(
    new Kysely<StorageSchema>({ dialect: new PostgresDialect({ pool }) }),
    'postgres',
    true,
  );
}
