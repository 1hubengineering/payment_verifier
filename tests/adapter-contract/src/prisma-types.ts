import type { PrismaClient as PostgresClient } from '../generated/postgres/client.ts';
import type { PrismaClient as MysqlClient } from '../generated/mysql/client.ts';
import type { PrismaClient as SqliteClient } from '../generated/sqlite/client.ts';
import { prismaStorage, prismaTransaction } from '@1hubengineering/adapter-prisma';
import type { VerificationStorage } from '@1hubengineering/verifier';

declare const postgres: PostgresClient;
declare const mysql: MysqlClient;
declare const sqlite: SqliteClient;
const storage: VerificationStorage[] = [
  prismaStorage(postgres),
  prismaStorage(mysql),
  prismaStorage(sqlite),
];
void storage;
void postgres.$transaction(async (tx) => {
  const scoped: VerificationStorage = prismaTransaction(tx, { isolationLevel: 'Serializable' });
  void scoped;
});
void mysql.$transaction(async (tx) => {
  const scoped: VerificationStorage = prismaTransaction(tx, { isolationLevel: 'Serializable' });
  void scoped;
});
void sqlite.$transaction(async (tx) => {
  const scoped: VerificationStorage = prismaTransaction(tx, { isolationLevel: 'Serializable' });
  void scoped;
});
// @ts-expect-error Weaker caller isolation is outside this adapter's contract.
prismaTransaction(postgres, { isolationLevel: 'ReadCommitted' });
// @ts-expect-error Caller transaction isolation must be explicit.
prismaTransaction(sqlite);
