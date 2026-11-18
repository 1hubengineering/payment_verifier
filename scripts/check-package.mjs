import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'receipt-package-'));
const run = (command, args, cwd) => execFileSync(command, args, { cwd, stdio: 'inherit' });

try {
  run('pnpm', ['pack', '--pack-destination', temporary], join(root, 'packages/receipt-verifier'));
  const archives = readdirSync(temporary).filter((file) => file.endsWith('.tgz'));
  assert.equal(archives.length, 1, 'Expected one packed library');
  writeFileSync(join(temporary, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  run(
    'npm',
    [
      'install',
      '--offline',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
      resolve(temporary, archives[0]),
    ],
    temporary,
  );

  const manifest = JSON.parse(
    readFileSync(join(temporary, 'node_modules/@andhub/receipt-verifier/package.json'), 'utf8'),
  );
  assert.equal(
    Object.keys(manifest.dependencies ?? {}).length,
    0,
    'Core must have no runtime dependencies',
  );
  assert.equal(
    Object.keys(manifest.peerDependencies ?? {}).length,
    0,
    'Core must not require a host toolchain',
  );

  writeFileSync(
    join(temporary, 'consumer.mjs'),
    `
import assert from 'node:assert/strict';
globalThis.fetch = () => { throw new Error('Unexpected import-time network request'); };
const core = await import('@andhub/receipt-verifier');
assert.deepEqual(Object.keys(core).sort(), ['StorageConflict', 'VerificationError', 'compareReceipt', 'createPaymentExpectation', 'createReceiptVerifier', 'parseEtbAmount', 'storageKey']);
const expected = core.createPaymentExpectation({
  tenantId: 'synthetic', paymentId: 'synthetic', provider: 'telebirr', currency: 'ETB',
  amountMinor: core.parseEtbAmount('0.29'), recipientName: 'Synthetic Merchant',
  recipientAccountLast4: '1234', reference: 'ORDER_1234', validFrom: 1000, validUntil: 2000,
});
const result = core.compareReceipt(expected, {
  provider: 'telebirr', currency: 'ETB', transactionId: 'SYNTH1234', status: 'SUCCESSFUL',
  amountMinor: 29, recipientName: 'Synthetic Merchant', recipientAccountLast4: '1234',
  reference: 'ORDER_1234', transactionAt: 1500, paymentType: null, ambiguousFields: [],
});
assert.equal(result.verificationStatus, 'MATCHED_RECEIPT_ONLY');
assert.equal(result.settlementStatus, 'UNCONFIRMED');
assert.equal(core.compareReceipt(expected, {}).verificationStatus, 'UNABLE_TO_VERIFY');
assert.equal(core.parseEtbAmount('0.29'), 29);
assert.equal(core.parseEtbAmount('500.00'), 50000);
assert.throws(() => core.parseEtbAmount('0.001'));
const providers = await import('@andhub/receipt-verifier/providers');
assert.equal(providers.normalizeReceiptLocator('telebirr', 'TEST1234AB').transactionId, 'TEST1234AB');
const parsed = providers.parseReceiptHtml('telebirr', '<html>unsupported</html>');
assert.equal(parsed.provenance.kind, 'SAVED_HTML');
assert.equal(core.compareReceipt(expected, parsed.evidence).verificationStatus, 'UNABLE_TO_VERIFY');
assert.equal(providers.isPublicDestination('127.0.0.1'), false);
`,
  );
  run(process.execPath, ['consumer.mjs'], temporary);

  writeFileSync(
    join(temporary, 'consumer.ts'),
    `
import { parseEtbAmount, type EtbMinorUnits, type VerificationStatus, type SettlementStatus, createPaymentExpectation, compareReceipt, type ReceiptComparison, type ReceiptEvidence }  from '@andhub/receipt-verifier';
import { parseReceiptHtml, normalizeReceiptLocator, type ProviderResult } from '@andhub/receipt-verifier/providers';
const parsed = parseReceiptHtml('telebirr', '');
const locator = normalizeReceiptLocator('telebirr', 'TEST1234AB');
const unavailable: ProviderResult = { kind: 'UNAVAILABLE', code: 'TIMEOUT' };
void [parsed, locator, unavailable];
const amount: EtbMinorUnits = parseEtbAmount('10.00');
const verification: VerificationStatus = 'MATCHED_RECEIPT_ONLY';
const settlement: SettlementStatus = 'UNCONFIRMED';
// @ts-expect-error A raw number must be validated at the library boundary.
const invalidAmount: EtbMinorUnits = 1;
// @ts-expect-error Settlement is not a receipt-verification outcome.
const invalidVerification: VerificationStatus = 'SETTLEMENT_CONFIRMED';
const expected = createPaymentExpectation({});
const result: ReceiptComparison = compareReceipt(expected, {});
const evidence: ReceiptEvidence['amountMinor'] = amount;
// @ts-expect-error Receipt comparison cannot confirm settlement.
const settled: 'SETTLEMENT_CONFIRMED' = result.settlementStatus;
void [amount, verification, settlement, invalidAmount, invalidVerification, result, evidence, settled];
`,
  );
  run(
    process.execPath,
    [
      join(root, 'node_modules/typescript/bin/tsc'),
      '--noEmit',
      '--strict',
      '--target',
      'ES2023',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      '--types',
      'node',
      '--typeRoots',
      join(root, 'node_modules/@types'),
      join(temporary, 'consumer.ts'),
    ],
    temporary,
  );
  run(
    'pnpm',
    ['pack', '--pack-destination', temporary],
    join(root, 'packages/receipt-verifier-provider-cbe'),
  );
  const cbeArchive = readdirSync(temporary).find(
    (file) => file.includes('provider-cbe') && file.endsWith('.tgz'),
  );
  assert.ok(cbeArchive);
  run(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
      resolve(temporary, cbeArchive),
      'playwright@1.65.1',
    ],
    temporary,
  );
  writeFileSync(
    join(temporary, 'optional.mjs'),
    `
import assert from 'node:assert/strict';
const { createCbeProvider } = await import('@andhub/receipt-verifier-provider-cbe');
assert.deepEqual(await createCbeProvider().retrieve('http://127.0.0.1/'), { kind: 'UNAVAILABLE', code: 'INVALID_LOCATOR' });
`,
  );
  run(process.execPath, ['optional.mjs'], temporary);
  run(
    'pnpm',
    ['pack', '--pack-destination', temporary],
    join(root, 'packages/receipt-verifier-storage-sql'),
  );
  const sqlArchive = readdirSync(temporary).find(
    (file) => file.includes('storage-sql') && file.endsWith('.tgz'),
  );
  assert.ok(sqlArchive);
  run(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
      resolve(temporary, sqlArchive),
      'better-sqlite3@13.2.0',
    ],
    temporary,
  );
  writeFileSync(
    join(temporary, 'storage.mjs'),
    `
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import { sqliteStorage } from '@andhub/receipt-verifier-storage-sql/sqlite';
import { createPaymentExpectation, createReceiptVerifier, parseEtbAmount } from '@andhub/receipt-verifier';
assert.equal(existsSync(new URL('./node_modules/pg', import.meta.url)), false);
assert.equal(existsSync(new URL('./node_modules/mysql2', import.meta.url)), false);
const database = new Database(':memory:');
const storage = sqliteStorage(database);
await storage.migrate();
const expectation = createPaymentExpectation({ tenantId: 'synthetic', paymentId: 'synthetic', provider: 'telebirr', currency: 'ETB', amountMinor: parseEtbAmount('0.29'), recipientName: 'Synthetic Merchant', recipientAccountLast4: '1234', reference: 'ORDER_1234', validFrom: 1000, validUntil: 2000 });
const verifier = createReceiptVerifier({ storage, now: () => 1500, providers: { telebirr: { async retrieve(url) { return { kind: 'EVIDENCE', provenance: { kind: 'OFFICIAL_HTTPS', url, retrievedAt: 1500, sha256: 'a'.repeat(64), parserVersion: '1' }, evidence: { provider: 'telebirr', currency: 'ETB', transactionId: 'SYNTH1234', status: 'SUCCESSFUL', amountMinor: parseEtbAmount('0.29'), recipientName: 'Synthetic Merchant', recipientAccountLast4: '1234', reference: 'ORDER_1234', transactionAt: 1500, paymentType: null, ambiguousFields: [] } }; } } } });
await verifier.registerExpectation(expectation);
const input = { tenantId: 'synthetic', paymentId: 'synthetic', idempotencyKey: 'synthetic', receiptLocator: 'SYNTH1234' };
const first = await verifier.submit(input);
assert.equal(first.verificationStatus, 'MATCHED_RECEIPT_ONLY');
assert.equal(first.settlementStatus, 'UNCONFIRMED');
assert.deepEqual(await verifier.submit(input), first);
assert.equal((await verifier.events()).length, 1);
assert.equal(database.open, true);
database.close();
`,
  );
  run(process.execPath, ['storage.mjs'], temporary);
  writeFileSync(
    join(temporary, 'adapter.ts'),
    `
import type { SqlStorage } from '@andhub/receipt-verifier-storage-sql';
import { createCbeProvider } from '@andhub/receipt-verifier-provider-cbe';
import { createReceiptVerifier, type VerificationStorage } from '@andhub/receipt-verifier';
const cbe = createCbeProvider();
declare const sql: SqlStorage;
const storage: VerificationStorage = sql;
const verifier = createReceiptVerifier({ storage, providers: { cbe } });
void verifier;
`,
  );
  run(
    process.execPath,
    [
      join(root, 'node_modules/typescript/bin/tsc'),
      '--noEmit',
      '--strict',
      '--target',
      'ES2023',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      '--types',
      'node',
      '--typeRoots',
      join(root, 'node_modules/@types'),
      join(temporary, 'adapter.ts'),
    ],
    temporary,
  );
  run(
    'pnpm',
    ['pack', '--pack-destination', temporary],
    join(root, 'packages/receipt-verifier-adapter-drizzle'),
  );
  const drizzleArchive = readdirSync(temporary).find(
    (file) => file.includes('adapter-drizzle') && file.endsWith('.tgz'),
  );
  assert.ok(drizzleArchive);
  const drizzleConsumers = [
    {
      engine: 'postgres',
      driver: 'node-postgres',
      setup: "import { Pool } from 'pg'; const client = new Pool(); const db = drizzle(client);",
      cleanup: 'await client.end();',
      peers: ['pg@8.23.1', '@types/pg@8.23.1'],
    },
    {
      engine: 'mysql',
      driver: 'mysql2',
      setup:
        "import { createPool } from 'mysql2/promise'; const client = createPool({host:'127.0.0.1'}); const db = drizzle(client);",
      cleanup: 'await client.end();',
      peers: ['mysql2@3.24.6'],
    },
    {
      engine: 'sqlite',
      driver: 'libsql',
      setup:
        "import { createClient } from '@libsql/client'; const client = createClient({url:'file::memory:'}); const db = drizzle(client);",
      cleanup: 'client.close();',
      peers: ['@libsql/client@0.17.4'],
    },
  ];
  for (const { engine, driver, setup, cleanup, peers } of drizzleConsumers) {
    const directory = join(temporary, `drizzle-${engine}`);
    mkdirSync(directory);
    writeFileSync(
      join(directory, 'package.json'),
      JSON.stringify({ private: true, type: 'module' }),
    );
    run(
      'npm',
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--package-lock=false',
        resolve(temporary, archives[0]),
        resolve(temporary, drizzleArchive),
        'drizzle-orm@0.45.4',
        ...peers,
      ],
      directory,
    );
    const label = engine[0].toUpperCase() + engine.slice(1);
    const imports = `import { drizzle } from 'drizzle-orm/${driver}';
import { drizzle${label}Storage, drizzle${label}Transaction, receiptVerifierRecords, receiptVerifierSchema } from '@andhub/receipt-verifier-adapter-drizzle/${engine}';
${setup}
`;
    writeFileSync(
      join(directory, 'consumer.mjs'),
      `import assert from 'node:assert/strict';
${imports}
assert.equal(drizzle${label}Storage(db).callerTransaction, false);
assert.throws(() => drizzle${label}Transaction(db), /caller-owned Drizzle transaction/);
assert.ok(receiptVerifierRecords); assert.ok(receiptVerifierSchema);
${cleanup}
`,
    );
    run(process.execPath, ['consumer.mjs'], directory);
    writeFileSync(
      join(directory, 'consumer.ts'),
      `${imports}
import type { VerificationStorage } from '@andhub/receipt-verifier';
const storage: VerificationStorage = drizzle${label}Storage(db);
await db.transaction(async (tx) => { const scoped: VerificationStorage = drizzle${label}Transaction(tx); void scoped; });
// @ts-expect-error A plain ORM handle is not a caller-owned transaction.
drizzle${label}Transaction(db);
void [storage, receiptVerifierRecords, receiptVerifierSchema];
${cleanup}
`,
    );
    run(
      process.execPath,
      [
        join(root, 'node_modules/typescript/bin/tsc'),
        '--noEmit',
        '--strict',
        '--skipLibCheck',
        '--target',
        'ES2023',
        '--module',
        'NodeNext',
        '--moduleResolution',
        'NodeNext',
        '--types',
        'node',
        '--typeRoots',
        join(root, 'node_modules/@types'),
        join(directory, 'consumer.ts'),
      ],
      directory,
    );
  }
  console.log(
    'Packed npm consumer: ESM comparison, exact money, declarations, and dependency boundary passed.',
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
