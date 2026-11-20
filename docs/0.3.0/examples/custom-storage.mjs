import Database from 'better-sqlite3';
import { StorageConflict } from '@1hubengineering/verifier';
import {
  decodeStorageRecord,
  encodeStorageRecord,
  validateStorageKey,
  validateStorageScan,
} from '@1hubengineering/verifier/storage';

// Give this adapter exclusive use of its own connection.
export function openCustomStorage(filename) {
  const db = new Database(filename, { timeout: 0 });
  try {
    db.exec(
      'CREATE TABLE IF NOT EXISTS app_verifier_records (key TEXT PRIMARY KEY COLLATE BINARY NOT NULL, payload TEXT NOT NULL)',
    );
  } catch (error) {
    db.close();
    throw error;
  }
  const read = db.prepare('SELECT payload FROM app_verifier_records WHERE key = ?');
  const insert = db.prepare('INSERT INTO app_verifier_records VALUES (?, ?)');
  const upsert = db.prepare(
    'INSERT INTO app_verifier_records VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET payload = excluded.payload',
  );
  const remove = db.prepare('DELETE FROM app_verifier_records WHERE key = ?');
  const scan = db.prepare(
    'SELECT key, payload FROM app_verifier_records WHERE key >= ? AND key < ? ORDER BY key LIMIT ?',
  );

  // Serialize all operations on this connection, including reads during writes.
  let pending = Promise.resolve();
  function serialize(work) {
    const next = pending.then(work);
    pending = next.catch(() => {});
    return next;
  }
  function get(key) {
    validateStorageKey(key);
    return decodeStorageRecord(read.get(key)?.payload);
  }

  return {
    storage: {
      read: (key) => serialize(() => get(key)),
      transaction: (work) =>
        serialize(async () => {
          let active = false;
          function requireActive() {
            if (!active || !db.inTransaction) throw new Error('Transaction scope has ended');
          }
          try {
            db.exec('BEGIN IMMEDIATE');
            active = true;
            const result = await work({
              async get(key) {
                requireActive();
                return get(key);
              },
              async insert(key, value) {
                requireActive();
                validateStorageKey(key);
                insert.run(key, encodeStorageRecord(value));
              },
              async set(key, value) {
                requireActive();
                validateStorageKey(key);
                upsert.run(key, encodeStorageRecord(value));
              },
              async delete(key) {
                requireActive();
                validateStorageKey(key);
                remove.run(key);
              },
              async scan(prefix, limit) {
                requireActive();
                validateStorageScan(prefix, limit);
                // SDK record suffixes are lowercase hex. The range excludes other record kinds.
                return scan.all(prefix, prefix + 'g', limit).map(({ key, payload }) => ({
                  key,
                  value: decodeStorageRecord(payload),
                }));
              },
            });
            active = false;
            db.exec('COMMIT');
            return result;
          } catch (error) {
            if (active || db.inTransaction) {
              if (db.inTransaction) db.exec('ROLLBACK');
              if (error?.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') throw new StorageConflict();
            }
            // A busy BEGIN, or a busy COMMIT followed by rollback, wrote no durable records.
            if (typeof error?.code === 'string' && /^SQLITE_BUSY(?:_|$)/.test(error.code)) {
              throw new StorageConflict();
            }
            throw error;
          }
        }),
    },
    close: () => serialize(() => db.close()),
  };
}
