import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const testRoot = join(root, 'tests/adapter-contract');
for (const engine of ['postgres', 'mysql', 'sqlite']) {
  const models = readFileSync(
    join(root, `packages/adapter-prisma/schema/${engine}.prisma`),
    'utf8',
  );
  const schema = readFileSync(join(testRoot, `prisma/${engine}.prisma`), 'utf8');
  assert.ok(
    schema.endsWith(models),
    'Test schema must use the distributed Prisma model definitions',
  );
  execFileSync(
    process.execPath,
    [
      join(testRoot, 'node_modules/prisma/build/index.js'),
      'generate',
      '--schema',
      `prisma/${engine}.prisma`,
    ],
    { cwd: testRoot, stdio: 'inherit' },
  );
}
