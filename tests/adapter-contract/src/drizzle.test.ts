import { drizzle as postgres } from 'drizzle-orm/node-postgres';
import { drizzle as mysql } from 'drizzle-orm/mysql2';
import { drizzle as sqlite } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import {
  drizzlePostgresStorage,
  drizzlePostgresTransaction,
} from '@1hubengineering/receipt-verifier-adapter-drizzle/postgres';
import {
  drizzleMysqlStorage,
  drizzleMysqlTransaction,
} from '@1hubengineering/receipt-verifier-adapter-drizzle/mysql';
import {
  drizzleSqliteStorage,
  drizzleSqliteTransaction,
} from '@1hubengineering/receipt-verifier-adapter-drizzle/sqlite';
import { adapterContract } from './suite.ts';
import type { AdapterHarness } from './suite.ts';
import {
  children,
  directPostgresHarness,
  directMysqlHarness,
  directSqliteHarness,
} from './harness.ts';

adapterContract(
  'Drizzle 0.45.4 / PostgreSQL 18.7 / pg 8.23.1',
  async (): Promise<AdapterHarness> => {
    const base = await directPostgresHarness();
    const db = postgres(base.postgresPool!);
    return {
      ...base,
      storage: drizzlePostgresStorage(db),
      fork: () => drizzlePostgresStorage(postgres(base.postgresPool!)),
      hostTransaction: (work) =>
        db.transaction((tx) => work(drizzlePostgresTransaction(tx)), {
          isolationLevel: 'serializable',
        }),
      restart: async (input) => (await children('drizzle-postgres', [input], 'replay'))[0]!,
      race: (inputs) => children('drizzle-postgres', inputs, 'race'),
    };
  },
);
adapterContract(
  'Drizzle 0.45.4 / MySQL 8.4.13 / mysql2 3.24.6',
  async (): Promise<AdapterHarness> => {
    const base = await directMysqlHarness();
    const db = mysql(base.mysqlPool!.promise());
    return {
      ...base,
      storage: drizzleMysqlStorage(db),
      fork: () => drizzleMysqlStorage(mysql(base.mysqlPool!.promise())),
      hostTransaction: (work) =>
        db.transaction((tx) => work(drizzleMysqlTransaction(tx)), {
          isolationLevel: 'serializable',
        }),
      restart: async (input) => (await children('drizzle-mysql', [input], 'replay'))[0]!,
      race: (inputs) => children('drizzle-mysql', inputs, 'race'),
    };
  },
);
adapterContract(
  'Drizzle 0.45.4 / local SQLite files / libSQL client 0.17.4',
  async (): Promise<AdapterHarness> => {
    const base = await directSqliteHarness();
    const clients: ReturnType<typeof createClient>[] = [];
    const open = (): ReturnType<typeof sqlite> => {
      const client = createClient({ url: `file:${base.sqliteFilename}` });
      clients.push(client);
      return sqlite(client);
    };
    const db = open();
    return {
      ...base,
      storage: drizzleSqliteStorage(db),
      fork: () => drizzleSqliteStorage(open()),
      hostTransaction: (work) => db.transaction((tx) => work(drizzleSqliteTransaction(tx))),
      restart: async (input) =>
        (await children('drizzle-sqlite', [input], 'replay', base.sqliteFilename))[0]!,
      race: (inputs) => children('drizzle-sqlite', inputs, 'race', base.sqliteFilename),
      async close() {
        for (const client of clients) client.close();
        await base.close();
      },
    };
  },
);
