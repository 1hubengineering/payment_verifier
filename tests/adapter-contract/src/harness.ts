import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { createPool } from 'mysql2';
import type { PoolConnection, Pool as MysqlPool } from 'mysql2';
import Database from 'better-sqlite3';
import { expect } from 'vite-plus/test';
import {
  postgresStorage,
  postgresTransaction,
} from '@1hubengineering/receipt-verifier-storage-sql/postgres';
import {
  mysqlStorage,
  mysqlTransaction,
} from '@1hubengineering/receipt-verifier-storage-sql/mysql';
import {
  sqliteStorage,
  sqliteTransaction,
} from '@1hubengineering/receipt-verifier-storage-sql/sqlite';
import type {
  VerificationStorage,
  VerificationSubmission,
  VerificationResult,
} from '@1hubengineering/receipt-verifier';
import { ENV } from '../env.ts';
import type { AdapterHarness } from './suite.ts';

export interface DirectHarness extends AdapterHarness {
  readonly postgresPool?: Pool;
  readonly mysqlPool?: MysqlPool;
  readonly sqliteFilename?: string;
}

function localTestUrl(value: string): string {
  const url = new URL(value);
  if (url.hostname !== '127.0.0.1' || url.pathname !== '/receipt_test')
    throw new Error('Adapter tests require the isolated loopback receipt_test database');
  return value;
}
export function children(
  engine: string,
  inputs: readonly VerificationSubmission[],
  mode: string,
  sqliteFile?: string,
): Promise<readonly VerificationResult[]> {
  let ready = 0;
  const processes = inputs.map((input) =>
    fork(
      fileURLToPath(new URL('./replay-child.mjs', import.meta.url)),
      [engine, JSON.stringify(input), mode],
      {
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        env: { ...process.env, ...(sqliteFile ? { RECEIPT_TEST_SQLITE_FILE: sqliteFile } : {}) },
      },
    ),
  );
  const results = processes.map(
    (child) =>
      new Promise<VerificationResult>((resolve, reject) => {
        let result: VerificationResult | undefined;
        child.on(
          'message',
          (message: { ready?: boolean; result?: VerificationResult; error?: string }) => {
            if (message.error) {
              reject(new Error(`Synthetic child failed: ${message.error}`));
              return;
            }
            if (message.ready && ++ready === processes.length)
              for (const worker of processes) worker.send('GO');
            if (message.result) result = message.result;
          },
        );
        child.on('error', () => reject(new Error('Synthetic child process error')));
        child.on('exit', (code) => {
          if (code === 0 && result) resolve(result);
          else reject(new Error('Synthetic child exited without a committed result'));
        });
      }),
  );
  const timer = setTimeout(() => {
    for (const child of processes) child.kill();
  }, 15000);
  return Promise.all(results).finally(async () => {
    clearTimeout(timer);
    await Promise.all(
      processes.map(async (child) => {
        if (child.exitCode !== null || child.signalCode !== null) return;
        const exited = once(child, 'exit');
        child.kill();
        await exited;
      }),
    );
  });
}

/** Kill only the synthetic child after it proves the persisted lease reached retrieval. */
export async function crashedWorker(
  engine: string,
  input: VerificationSubmission,
  now: number,
  sqliteFile?: string,
): Promise<void> {
  const child = fork(
    fileURLToPath(new URL('./replay-child.mjs', import.meta.url)),
    [engine, JSON.stringify(input), 'job-crash', String(now)],
    {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      env: { ...process.env, ...(sqliteFile ? { RECEIPT_TEST_SQLITE_FILE: sqliteFile } : {}) },
    },
  );
  const timer = setTimeout(() => child.kill('SIGKILL'), 15000);
  try {
    await new Promise<void>((resolve, reject) => {
      let ready = false;
      child.on('message', (message: { ready?: boolean; error?: string }) => {
        if (message.ready) {
          ready = true;
          child.kill('SIGKILL');
        } else if (message.error) reject(new Error(`Synthetic crash child: ${message.error}`));
      });
      child.on('error', reject);
      child.on('exit', (_code, signal) => {
        if (ready && signal === 'SIGKILL') resolve();
        else reject(new Error('Synthetic child did not reach its durable lease'));
      });
    });
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGKILL');
      await exited;
    }
  }
}

export async function directPostgresHarness(): Promise<DirectHarness> {
  const pool = new Pool({
    connectionString: localTestUrl(ENV.RECEIPT_TEST_POSTGRES_URL),
    max: 10,
  });
  const storage = postgresStorage(pool);
  return {
    postgresPool: pool,
    storage,
    fork: () => postgresStorage(pool),
    reset: async () => {
      await pool.query('DELETE FROM receipt_verifier_records');
    },
    migrate: () => storage.migrate(),
    async incompatibleVersion() {
      await pool.query('UPDATE receipt_verifier_schema SET version=2');
      try {
        await expect(storage.migrate()).rejects.toThrow('Invalid receipt storage');
      } finally {
        await pool.query('UPDATE receipt_verifier_schema SET version=1');
      }
    },
    async missingPrimaryKey() {
      await pool.query(
        'ALTER TABLE receipt_verifier_records DROP CONSTRAINT receipt_verifier_records_pkey',
      );
      try {
        await expect(storage.migrate()).rejects.toThrow('Invalid receipt storage');
      } finally {
        await pool.query('ALTER TABLE receipt_verifier_records ADD PRIMARY KEY (record_key)');
      }
    },
    async hostTransaction(work) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        const result = await work(postgresTransaction(client));
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async assertOwnerOpen() {
      await pool.query('SELECT 1');
    },
    restart: async (input) => (await children('postgres', [input], 'replay'))[0]!,
    race: (inputs) => children('postgres', inputs, 'race'),
    crashJob: (input, now) => crashedWorker('postgres', input, now),
    close: () => pool.end(),
  };
}

export async function directMysqlHarness(): Promise<DirectHarness> {
  const pool = createPool(localTestUrl(ENV.RECEIPT_TEST_MYSQL_URL));
  const storage = mysqlStorage(pool);
  return {
    mysqlPool: pool,
    storage,
    fork: () => mysqlStorage(pool),
    reset: async () => {
      await pool.promise().query('DELETE FROM receipt_verifier_records');
    },
    migrate: () => storage.migrate(),
    async incompatibleVersion() {
      await pool.promise().query('UPDATE receipt_verifier_schema SET version=2');
      try {
        await expect(storage.migrate()).rejects.toThrow('Invalid receipt storage');
      } finally {
        await pool.promise().query('UPDATE receipt_verifier_schema SET version=1');
      }
    },
    async missingPrimaryKey() {
      await pool.promise().query('ALTER TABLE receipt_verifier_records DROP PRIMARY KEY');
      try {
        await expect(storage.migrate()).rejects.toThrow('Invalid receipt storage');
      } finally {
        await pool
          .promise()
          .query('ALTER TABLE receipt_verifier_records ADD PRIMARY KEY (record_key)');
      }
    },
    async hostTransaction(work) {
      const connection = await new Promise<PoolConnection>((resolve, reject) =>
        pool.getConnection((error, client) => {
          if (error) reject(error);
          else resolve(client);
        }),
      );
      try {
        await connection.promise().query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
        await connection.promise().beginTransaction();
        const result = await work(mysqlTransaction(connection));
        await connection.promise().commit();
        return result;
      } catch (error) {
        await connection.promise().rollback();
        throw error;
      } finally {
        connection.release();
      }
    },
    async assertOwnerOpen() {
      await pool.promise().query('SELECT 1');
    },
    restart: async (input) => (await children('mysql', [input], 'replay'))[0]!,
    race: (inputs) => children('mysql', inputs, 'race'),
    crashJob: (input, now) => crashedWorker('mysql', input, now),
    close: () => pool.promise().end(),
  };
}

export async function directSqliteHarness(): Promise<DirectHarness> {
  const directory = mkdtempSync(join(tmpdir(), 'receipt-contract-')),
    filename = join(directory, 'synthetic.db');
  const database = new Database(filename, { timeout: 20 });
  database.pragma('journal_mode = WAL');
  const opened = [database];
  const storage = sqliteStorage(database);
  return {
    sqliteFilename: filename,
    storage,
    fork() {
      const db = new Database(filename, { timeout: 20 });
      opened.push(db);
      return sqliteStorage(db);
    },
    reset: async () => {
      database.exec('DELETE FROM receipt_verifier_records');
    },
    migrate: () => storage.migrate(),
    async incompatibleVersion() {
      database.exec('UPDATE receipt_verifier_schema SET version=2');
      try {
        await expect(storage.migrate()).rejects.toThrow('Invalid receipt storage');
      } finally {
        database.exec('UPDATE receipt_verifier_schema SET version=1');
      }
    },
    async missingPrimaryKey() {
      database.exec(
        'DROP TABLE receipt_verifier_records; CREATE TABLE receipt_verifier_records (record_key TEXT NOT NULL, payload TEXT NOT NULL)',
      );
      try {
        await expect(storage.migrate()).rejects.toThrow('Invalid receipt storage');
      } finally {
        database.exec(
          'DROP TABLE receipt_verifier_records; CREATE TABLE receipt_verifier_records (record_key TEXT PRIMARY KEY, payload TEXT NOT NULL)',
        );
      }
    },
    async hostTransaction<T>(work: (storage: VerificationStorage) => Promise<T>): Promise<T> {
      database.exec('BEGIN IMMEDIATE');
      try {
        const result = await work(sqliteTransaction(database));
        database.exec('COMMIT');
        return result;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
    async assertOwnerOpen() {
      expect(database.open).toBe(true);
      database.prepare('SELECT 1').get();
    },
    restart: async (input) => (await children('sqlite', [input], 'replay', filename))[0]!,
    race: (inputs) => children('sqlite', inputs, 'race', filename),
    crashJob: (input, now) => crashedWorker('sqlite', input, now, filename),
    async close() {
      for (const db of opened) db.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
