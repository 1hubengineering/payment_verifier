import { drizzle as postgres } from 'drizzle-orm/node-postgres';
import { drizzle as mysql } from 'drizzle-orm/mysql2';
import { drizzle as sqlite } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import {
  drizzlePostgresStorage,
  drizzlePostgresTransaction,
} from '@1hubengineering/adapter-drizzle/postgres';
import {
  drizzleMysqlStorage,
  drizzleMysqlTransaction,
} from '@1hubengineering/adapter-drizzle/mysql';
import {
  drizzleSqliteStorage,
  drizzleSqliteTransaction,
} from '@1hubengineering/adapter-drizzle/sqlite';
import { adapterContract } from './suite.ts';
import type { AdapterHarness } from './suite.ts';
import {
  children,
  crashedWorker,
  sqliteMaintenance,
  directPostgresHarness,
  directMysqlHarness,
  directSqliteHarness,
} from './harness.ts';

adapterContract(
  'Drizzle 1.0.0-rc.5 / PostgreSQL 18.7 / pg 8.23.1',
  async (): Promise<AdapterHarness> => {
    const base = await directPostgresHarness();
    const db = postgres({ client: base.postgresPool! });
    return {
      ...base,
      storage: drizzlePostgresStorage(db),
      fork: () => drizzlePostgresStorage(postgres({ client: base.postgresPool! })),
      hostTransaction: (work) =>
        db.transaction((tx) => work(drizzlePostgresTransaction(tx)), {
          isolationLevel: 'serializable',
        }),
      restart: async (input) => (await children('drizzle-postgres', [input], 'replay'))[0]!,
      race: (inputs) => children('drizzle-postgres', inputs, 'race'),
      crashJob: (input, now) => crashedWorker('drizzle-postgres', input, now),
    };
  },
);
adapterContract(
  'Drizzle 1.0.0-rc.5 / MySQL 8.4.13 / mysql2 3.24.6',
  async (): Promise<AdapterHarness> => {
    const base = await directMysqlHarness();
    const db = mysql({ client: base.mysqlPool!.promise() });
    return {
      ...base,
      storage: drizzleMysqlStorage(db),
      fork: () => drizzleMysqlStorage(mysql({ client: base.mysqlPool!.promise() })),
      hostTransaction: (work) =>
        db.transaction((tx) => work(drizzleMysqlTransaction(tx)), {
          isolationLevel: 'serializable',
        }),
      restart: async (input) => (await children('drizzle-mysql', [input], 'replay'))[0]!,
      race: (inputs) => children('drizzle-mysql', inputs, 'race'),
      crashJob: (input, now) => crashedWorker('drizzle-mysql', input, now),
    };
  },
);
adapterContract(
  'Drizzle 1.0.0-rc.5 / local SQLite files / libSQL client 0.17.4',
  async (): Promise<AdapterHarness> => {
    const base = await directSqliteHarness();
    base.detachSqlite!();
    const clients: ReturnType<typeof createClient>[] = [];
    const open = (): ReturnType<typeof sqlite> => {
      const client = createClient({ url: `file:${base.sqliteFilename}` });
      clients.push(client);
      return sqlite({ client });
    };
    const db = open();
    return {
      ...base,
      storage: drizzleSqliteStorage(db),
      migrate: () => sqliteMaintenance(base.sqliteFilename!, 'migrate'),
      reset: () => sqliteMaintenance(base.sqliteFilename!, 'reset'),
      incompatibleVersion: () => sqliteMaintenance(base.sqliteFilename!, 'incompatible'),
      missingPrimaryKey: () => sqliteMaintenance(base.sqliteFilename!, 'missing-key'),
      async assertOwnerOpen() {
        await db.run('SELECT 1');
      },
      fork: () => drizzleSqliteStorage(open()),
      hostTransaction: (work) => db.transaction((tx) => work(drizzleSqliteTransaction(tx))),
      restart: async (input) =>
        (await children('drizzle-sqlite', [input], 'replay', base.sqliteFilename))[0]!,
      race: (inputs) => children('drizzle-sqlite', inputs, 'race', base.sqliteFilename),
      crashJob: (input, now) => crashedWorker('drizzle-sqlite', input, now, base.sqliteFilename),
      async close() {
        for (const client of clients) client.close();
        await base.close();
      },
    };
  },
);
