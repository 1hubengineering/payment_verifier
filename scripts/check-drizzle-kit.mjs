import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cwd = join(root, 'packages/receipt-verifier-adapter-drizzle');
const temporary = mkdtempSync(join(tmpdir(), 'receipt-drizzle-kit-'));
function kit(verb, dialect, file, out) {
  const args = ['exec', 'drizzle-kit', verb, '--dialect', dialect, '--output', 'json'];
  if (verb !== 'export') args.push('--out', out);
  if (verb !== 'up') args.push('--schema', `./src/${file}.ts`);
  const result = JSON.parse(execFileSync('pnpm', args, { cwd, encoding: 'utf8' }));
  assert.equal(result.status, 'ok', JSON.stringify(result));
  return result;
}
try {
  for (const [dialect, file] of [
    ['postgresql', 'postgres'],
    ['mysql', 'mysql'],
    ['sqlite', 'sqlite'],
    ['turso', 'sqlite'],
  ]) {
    const out = join(temporary, dialect);
    mkdirSync(out);
    assert.deepEqual(kit('up', dialect, file, out).upgraded, []);
    const checked = kit('check', dialect, file, out);
    // The host's direct SQL migration owns these tables; there is no Kit history.
    assert.deepEqual(
      (checked.warnings ?? []).map((warning) => warning.kind),
      dialect === 'postgresql' ? ['schema_changed'] : [],
    );
    const exported = kit('export', dialect, file, out);
    assert.deepEqual(exported.warnings, []);
    assert.equal(exported.statements.length, 2);
    const sql = exported.statements
      .map((statement) => statement.replace(/["`]/g, '').replace(/\s+/g, ' ').trim())
      .join('\n');
    assert.match(
      sql,
      /CREATE TABLE receipt_verifier_records \( record_key (varchar\(96\)|text) PRIMARY KEY, payload text NOT NULL \);/,
    );
    assert.match(
      sql,
      /CREATE TABLE receipt_verifier_schema \( id (integer|int) PRIMARY KEY, version (integer|int) NOT NULL \);/,
    );
    console.log(
      `Drizzle Kit ${dialect}: local up/check and v1 schema export passed; no database used.`,
    );
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
