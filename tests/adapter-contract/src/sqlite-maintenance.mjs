import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { sqliteStorage } from '@1hubengineering/storage-sql/sqlite';

// One native SQLite implementation per process/file. ORM callers keep theirs open.
const [filename, operation] = process.argv.slice(2);
const database = new Database(filename, { timeout: 5000 });
const storage = sqliteStorage(database);
try {
  if (operation === 'migrate') {
    database.pragma('journal_mode = WAL');
    await storage.migrate();
  } else if (operation === 'reset') {
    database.exec('DELETE FROM receipt_verifier_records');
  } else if (operation === 'incompatible') {
    database.exec('UPDATE receipt_verifier_schema SET version=2');
    try {
      await assert.rejects(storage.migrate(), /Invalid receipt storage/);
    } finally {
      database.exec('UPDATE receipt_verifier_schema SET version=1');
    }
  } else if (operation === 'missing-key') {
    database.exec(
      'DROP TABLE receipt_verifier_records; CREATE TABLE receipt_verifier_records (record_key TEXT NOT NULL, payload TEXT NOT NULL)',
    );
    try {
      await assert.rejects(storage.migrate(), /Invalid receipt storage/);
    } finally {
      database.exec(
        'DROP TABLE receipt_verifier_records; CREATE TABLE receipt_verifier_records (record_key TEXT PRIMARY KEY, payload TEXT NOT NULL)',
      );
    }
  } else throw new Error('Unknown synthetic maintenance operation');
} finally {
  database.close();
}
