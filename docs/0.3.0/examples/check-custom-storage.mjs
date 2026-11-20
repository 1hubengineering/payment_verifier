import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createReceiptVerifier, storageKey, StorageConflict } from '@1hubengineering/verifier';
import { openCustomStorage } from './custom-storage.mjs';

if (process.argv.length !== 3) throw new Error('Pass a new, empty scratch directory.');
const path = join(process.argv[2], 'custom.sqlite');
const primary = openCustomStorage(path);
const independent = openCustomStorage(path);
const key = storageKey('example', 'first');
const discarded = storageKey('example', 'rollback');
try {
  await createReceiptVerifier({ storage: primary.storage, providers: {} }).initialize();
  await primary.storage.transaction(async (tx) => {
    await tx.insert(key, { fixture: true });
    await assert.rejects(
      independent.storage.transaction(async () => {}),
      StorageConflict,
    );
  });
  assert.deepEqual(await independent.storage.read(key), { fixture: true });
  await assert.rejects(
    independent.storage.transaction(async (tx) => {
      await tx.insert(key, { fixture: false });
    }),
    StorageConflict,
  );
  await assert.rejects(
    primary.storage.transaction(async (tx) => {
      await tx.insert(discarded, { fixture: false });
      throw new Error('rollback demonstration');
    }),
    /rollback demonstration/,
  );
  assert.equal(await independent.storage.read(discarded), undefined);
  const rows = await independent.storage.transaction((tx) => tx.scan('rv1:example:', 10));
  assert.deepEqual(rows, [{ key, value: { fixture: true } }]);
  console.log(
    'Custom storage initialized. Locking, unique inserts, read, scan and rollback passed.',
  );
} finally {
  await independent.close();
  await primary.close();
}
