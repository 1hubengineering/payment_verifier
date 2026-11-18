import { adapterContract } from './suite.ts';
import { directPostgresHarness, directMysqlHarness, directSqliteHarness } from './harness.ts';
adapterContract('direct PostgreSQL 18.7 / pg 8.23.1 / Kysely 0.29.9', directPostgresHarness);
adapterContract('direct MySQL 8.4.13 / mysql2 3.24.6 / Kysely 0.29.9', directMysqlHarness);
adapterContract(
  'direct SQLite 3.54.1 / better-sqlite3 13.2.0 / Kysely 0.29.9',
  directSqliteHarness,
);
