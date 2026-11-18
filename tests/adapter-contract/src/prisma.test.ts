import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient as PostgresClient } from '../generated/postgres/client.ts';
import { PrismaClient as MysqlClient } from '../generated/mysql/client.ts';
import { PrismaClient as SqliteClient } from '../generated/sqlite/client.ts';
import { prismaStorage, prismaTransaction } from '@1hubengineering/receipt-verifier-adapter-prisma';
import type { PrismaReceiptClient } from '@1hubengineering/receipt-verifier-adapter-prisma';
import { ENV } from '../env.ts';
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
import type { DirectHarness } from './harness.ts';

interface ManagedClient extends PrismaReceiptClient {
  $disconnect(): Promise<void>;
  $queryRawUnsafe(query: string): Promise<unknown>;
}
function harness(
  base: DirectHarness,
  createClient: () => ManagedClient,
  engine: string,
): AdapterHarness {
  const clients: ManagedClient[] = [];
  const open = (): ManagedClient => {
    const client = createClient();
    clients.push(client);
    return client;
  };
  const client = open();
  return {
    ...base,
    storage: prismaStorage(client),
    ...(base.sqliteFilename
      ? {
          migrate: () => sqliteMaintenance(base.sqliteFilename!, 'migrate'),
          reset: () => sqliteMaintenance(base.sqliteFilename!, 'reset'),
          incompatibleVersion: () => sqliteMaintenance(base.sqliteFilename!, 'incompatible'),
          missingPrimaryKey: () => sqliteMaintenance(base.sqliteFilename!, 'missing-key'),
        }
      : {}),
    fork: () => prismaStorage(open()),
    hostTransaction: (work) =>
      client.$transaction((tx) => work(prismaTransaction(tx, { isolationLevel: 'Serializable' })), {
        isolationLevel: 'Serializable',
        maxWait: 5000,
        timeout: 5000,
      }),
    async assertOwnerOpen() {
      if (!base.sqliteFilename) await base.assertOwnerOpen();
      await client.$queryRawUnsafe('SELECT 1');
    },
    restart: async (input) =>
      (await children(`prisma-${engine}`, [input], 'replay', base.sqliteFilename))[0]!,
    race: (inputs) => children(`prisma-${engine}`, inputs, 'race', base.sqliteFilename),
    crashJob: (input, now) => crashedWorker(`prisma-${engine}`, input, now, base.sqliteFilename),
    async close() {
      await Promise.all(clients.map((c) => c.$disconnect()));
      await base.close();
    },
  };
}
adapterContract('Prisma 7.10.1 / PostgreSQL 18.7 / official pg adapter', async () => {
  const base = await directPostgresHarness();
  return harness(
    base,
    () =>
      new PostgresClient({
        adapter: new PrismaPg({ connectionString: ENV.RECEIPT_TEST_POSTGRES_URL }),
      }),
    'postgres',
  );
});
adapterContract('Prisma 7.10.1 / MySQL 8.4.13 / official MariaDB adapter 3.5.4', async () => {
  const base = await directMysqlHarness();
  return harness(
    base,
    () => new MysqlClient({ adapter: new PrismaMariaDb(ENV.RECEIPT_TEST_MYSQL_URL) }),
    'mysql',
  );
});
adapterContract('Prisma 7.10.1 / SQLite / official better-sqlite3 12.11.1 adapter', async () => {
  const base = await directSqliteHarness();
  base.detachSqlite!();
  return harness(
    base,
    () =>
      new SqliteClient({
        adapter: new PrismaBetterSqlite3({ url: `file:${base.sqliteFilename}`, timeout: 20 }),
      }),
    'sqlite',
  );
});
