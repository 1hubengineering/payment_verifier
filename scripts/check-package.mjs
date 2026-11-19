import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'receipt-package-'));
const run = (command, args, cwd) => execFileSync(command, args, { cwd, stdio: 'inherit' });

try {
  run('pnpm', ['pack', '--pack-destination', temporary], join(root, 'packages/verifier'));
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
    readFileSync(join(temporary, 'node_modules/@1hubengineering/verifier/package.json'), 'utf8'),
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
const core = await import('@1hubengineering/verifier');
assert.deepEqual(Object.keys(core).sort(), ['StorageConflict', 'VerificationOperationError', 'comparePaymentAmount', 'compareReceipt', 'createPaymentExpectation', 'createReceiptVerifier', 'parseEtbAmount', 'storageKey']);
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
assert.equal(result.status, 'MATCH');
assert.equal('verified' in result, false);
assert.equal(core.compareReceipt(expected, {}).status, 'INCOMPLETE');
assert.equal(core.parseEtbAmount('0.29'), 29);
assert.equal(core.parseEtbAmount('500.00'), 50000);
assert.throws(() => core.parseEtbAmount('0.001'));
const jobsModule = await import('@1hubengineering/verifier/jobs');
const noWorkStorage = { read: async () => { throw new Error('Import/construction performed I/O'); }, transaction: async () => { throw new Error('Import/construction started a transaction'); } };
assert.equal(typeof jobsModule.createDurableVerifier({ storage: noWorkStorage, providers: {}, encryptionKey: new Uint8Array(32) }).enqueue, 'function');
assert.throws(() => jobsModule.createDurableVerifier({ storage: { ...noWorkStorage, callerTransaction: true }, providers: {}, encryptionKey: new Uint8Array(32) }), {code:'QUEUE_CONFIGURATION'});
const { detectPaymentInput } = await import('@1hubengineering/verifier/input');
const browserModule = await import('node:fs/promises');
const visited = new Set();
async function verifyBrowserModule(url) {
  if (visited.has(url.href)) return;
  visited.add(url.href);
  const source = await browserModule.readFile(url, 'utf8');
  for (const [, dependency] of source.matchAll(/(?:from |import )["']([^"']+)["']/g)) {
    assert.ok(dependency.startsWith('.'), 'Browser parser dependency: ' + dependency);
    await verifyBrowserModule(new URL(dependency, url));
  }
}
await verifyBrowserModule(new URL(import.meta.resolve('@1hubengineering/verifier/input')));
assert.equal(detectPaymentInput('v2-Synthetic_42').value.identifier, 'v2-Synthetic_42');
await verifyBrowserModule(new URL(import.meta.resolve('@1hubengineering/verifier/comparison')));
const browserComparison = await import('@1hubengineering/verifier/comparison');
assert.deepEqual(Object.keys(browserComparison).sort(), ['comparePaymentAmount', 'compareReceipt', 'createPaymentExpectation', 'parseEtbAmount']);
assert.equal(browserComparison.parseEtbAmount('0.29'), 29);
const providers = await import('@1hubengineering/verifier/providers');
assert.equal(providers.normalizeReceiptLocator('telebirr', 'TEST1234AB').transactionId, 'TEST1234AB');
const parsed = providers.parseReceiptHtml('telebirr', '<html>unsupported</html>');
assert.equal(parsed.provenance.kind, 'SAVED_HTML');
assert.equal(core.compareReceipt(expected, parsed.evidence).status, 'INCOMPLETE');
assert.equal(providers.isPublicDestination('127.0.0.1'), false);
await assert.rejects(providers.checkProviderConnectivity('cbe', { telebirrTunnelSocket: '/tmp/receipt.sock' }), TypeError);
`,
  );
  run(process.execPath, ['consumer.mjs'], temporary);

  writeFileSync(
    join(temporary, 'consumer.ts'),
    `
import { parseEtbAmount, type EtbMinorUnits, type VerificationStatus, type VerificationResult, createPaymentExpectation, compareReceipt, type ReceiptComparison, type ReceiptEvidence }  from '@1hubengineering/verifier';
import { checkProviderConnectivity, parseReceiptHtml, normalizeReceiptLocator, type ProviderConnectionCheck, type ProviderResult } from '@1hubengineering/verifier/providers';
const check: (provider: 'telebirr') => Promise<readonly ProviderConnectionCheck[]> = checkProviderConnectivity;
void check;
import { createDurableVerifier, type VerificationJob } from '@1hubengineering/verifier/jobs';
import type { VerificationStorage } from '@1hubengineering/verifier';
import { parseEtbAmount as parseBrowserAmount, type EtbMinorUnits as BrowserMinorUnits } from '@1hubengineering/verifier/comparison';
const browserAmount: BrowserMinorUnits = parseBrowserAmount('10.00');
void browserAmount;
declare const storage: VerificationStorage;
const jobs = createDurableVerifier({storage,providers:{},encryptionKey:new Uint8Array(32)});
const accepted: Promise<VerificationJob> = jobs.enqueue({tenantId:'synthetic',paymentId:'synthetic',idempotencyKey:'synthetic',receiptLocator:'SYNTH1234'});
// @ts-expect-error Status always requires the trusted tenant and payment scope.
jobs.status({paymentId:'synthetic'},'job');
void accepted;
const parsed = parseReceiptHtml('telebirr', '');
const locator = normalizeReceiptLocator('telebirr', 'TEST1234AB');
const unavailable: ProviderResult = { kind: 'UNAVAILABLE', code: 'PROVIDER_TIMEOUT', stage: 'receipt_retrieval', retryable: true, details: { timeoutMs: 1000 } };
void [parsed, locator, unavailable];
const amount: EtbMinorUnits = parseEtbAmount('10.00');
const verification: VerificationStatus = 'VERIFIED';
declare const outcome: VerificationResult;
if (outcome.verified) { const exact: 'VERIFIED' = outcome.status; void exact; }
// @ts-expect-error A raw number must be validated at the library boundary.
const invalidAmount: EtbMinorUnits = 1;
// @ts-expect-error An unknown verification status is rejected.
const invalidVerification: VerificationStatus = 'SETTLEMENT_CONFIRMED';
const expected = createPaymentExpectation({});
const result: ReceiptComparison = compareReceipt(expected, {});
const evidence: ReceiptEvidence['amountMinor'] = amount;
// @ts-expect-error Pure comparison has no official verification flag.
const verified = result.verified;
void [amount, verification, invalidAmount, invalidVerification, result, evidence, verified];
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
  run('pnpm', ['pack', '--pack-destination', temporary], join(root, 'packages/provider-cbe'));
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
const { checkCbeBrowser, createCbeProvider } = await import('@1hubengineering/provider-cbe');
assert.equal(typeof checkCbeBrowser, 'function');
await assert.rejects(createCbeProvider().retrieve('http://127.0.0.1/'), { code: 'INVALID_REQUEST' });
`,
  );
  run(process.execPath, ['optional.mjs'], temporary);
  run('pnpm', ['pack', '--pack-destination', temporary], join(root, 'packages/storage-sql'));
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
import { sqliteStorage, sqliteTransaction } from '@1hubengineering/storage-sql/sqlite';
import { createPaymentExpectation, createReceiptVerifier, parseEtbAmount } from '@1hubengineering/verifier';
assert.equal(existsSync(new URL('./node_modules/pg', import.meta.url)), false);
assert.equal(existsSync(new URL('./node_modules/mysql2', import.meta.url)), false);
const database = new Database(':memory:');
const storage = sqliteStorage(database);
await storage.migrate();
assert.throws(()=>sqliteTransaction(database), /active caller-owned SQLite transaction/);
database.exec('BEGIN IMMEDIATE');
const endedScope = sqliteTransaction(database);
database.exec('ROLLBACK');
await assert.rejects(endedScope.read('rv1:host:'+'0'.repeat(64)), /active caller-owned SQLite transaction/);
await assert.rejects(endedScope.transaction(async()=>{}), /active caller-owned SQLite transaction/);
const expectation = createPaymentExpectation({ tenantId: 'synthetic', paymentId: 'synthetic', provider: 'telebirr', currency: 'ETB', amountMinor: parseEtbAmount('0.29'), recipientName: 'Synthetic Merchant', recipientAccountLast4: '1234', reference: 'ORDER_1234', validFrom: 1000, validUntil: 2000 });
const verifier = createReceiptVerifier({ storage, now: () => 1500, providers: { telebirr: { async retrieve(url) { return { kind: 'EVIDENCE', provenance: { kind: 'OFFICIAL_HTTPS', url, retrievedAt: 1500, sha256: 'a'.repeat(64), parserVersion: '1' }, evidence: { provider: 'telebirr', currency: 'ETB', transactionId: 'SYNTH1234', status: 'SUCCESSFUL', amountMinor: parseEtbAmount('0.29'), recipientName: 'Synthetic Merchant', recipientAccountLast4: '1234', reference: 'ORDER_1234', transactionAt: 1500, paymentType: null, ambiguousFields: [] } }; } } } });
await verifier.registerExpectation(expectation);
const input = { tenantId: 'synthetic', paymentId: 'synthetic', idempotencyKey: 'synthetic', receiptLocator: 'SYNTH1234' };
const first = await verifier.submit(input);
assert.equal(first.status, 'VERIFIED');
assert.equal(first.verified, true);
assert.deepEqual(await verifier.submit(input), first);
assert.equal((await verifier.events()).length, 1);
const { createDurableVerifier } = await import('@1hubengineering/verifier/jobs');
await verifier.registerExpectation({...expectation,paymentId:'queued'});
const jobs = createDurableVerifier({storage,providers:{},encryptionKey:new Uint8Array(32).fill(1),policy:{maxAttempts:1},now:()=>1500});
await jobs.initialize();
const jobInput={...input,paymentId:'queued',idempotencyKey:'queued'};
const accepted = await jobs.enqueue(jobInput);
assert.equal(accepted.state,'QUEUED');
assert.equal(await jobs.runOnce(),'FAILED');
assert.equal((await jobs.status(jobInput,accepted.jobId)).error.code,'PROVIDER_NOT_CONFIGURED');
assert.equal(database.open, true);
database.close();
`,
  );
  run(process.execPath, ['storage.mjs'], temporary);
  writeFileSync(
    join(temporary, 'adapter.ts'),
    `
import type { SqlStorage } from '@1hubengineering/storage-sql';
import { createCbeProvider } from '@1hubengineering/provider-cbe';
import { createReceiptVerifier, type VerificationStorage } from '@1hubengineering/verifier';
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
  run('pnpm', ['pack', '--pack-destination', temporary], join(root, 'packages/adapter-drizzle'));
  const drizzleArchive = readdirSync(temporary).find(
    (file) => file.includes('adapter-drizzle') && file.endsWith('.tgz'),
  );
  assert.ok(drizzleArchive);
  const drizzleVersion = JSON.parse(
    readFileSync(
      join(root, 'packages/adapter-drizzle/node_modules/drizzle-orm/package.json'),
      'utf8',
    ),
  ).version;
  const drizzleConsumers = [
    {
      engine: 'postgres',
      driver: 'node-postgres',
      setup:
        "import { Pool } from 'pg'; const client = new Pool(); const db = drizzle({ client });",
      cleanup: 'await client.end();',
      peers: ['pg@8.23.1', '@types/pg@8.23.1'],
    },
    {
      engine: 'mysql',
      driver: 'mysql2',
      setup:
        "import { createPool } from 'mysql2/promise'; const client = createPool({host:'127.0.0.1'}); const db = drizzle({ client });",
      cleanup: 'await client.end();',
      peers: ['mysql2@3.24.6'],
    },
    {
      engine: 'sqlite',
      driver: 'libsql',
      setup:
        "import { createClient } from '@libsql/client'; const client = createClient({url:'file::memory:'}); const db = drizzle({ client });",
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
        `drizzle-orm@${drizzleVersion}`,
        ...peers,
      ],
      directory,
    );
    const label = engine[0].toUpperCase() + engine.slice(1);
    const imports = `import { drizzle } from 'drizzle-orm/${driver}';
import { drizzle${label}Storage, drizzle${label}Transaction, receiptVerifierRecords, receiptVerifierSchema } from '@1hubengineering/adapter-drizzle/${engine}';
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
import type { VerificationStorage } from '@1hubengineering/verifier';
import { defineRelations } from 'drizzle-orm';
const storage: VerificationStorage = drizzle${label}Storage(db);
const relations = defineRelations({ receiptVerifierRecords, receiptVerifierSchema });
const withRelations = drizzle({ client, relations });
const relationStorage: VerificationStorage = drizzle${label}Storage(withRelations);
await withRelations.transaction(async (tx) => { const scoped: VerificationStorage = drizzle${label}Transaction(tx); void scoped; });
void relationStorage;
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
  run('pnpm', ['pack', '--pack-destination', temporary], join(root, 'packages/adapter-prisma'));
  const prismaArchive = readdirSync(temporary).find(
    (file) => file.includes('adapter-prisma') && file.endsWith('.tgz'),
  );
  assert.ok(prismaArchive);
  const prismaDirectory = join(temporary, 'prisma');
  mkdirSync(prismaDirectory);
  writeFileSync(
    join(prismaDirectory, 'package.json'),
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
      resolve(temporary, prismaArchive),
      '@prisma/client@7.10.1',
    ],
    prismaDirectory,
  );
  cpSync(join(root, 'tests/adapter-contract/generated'), join(prismaDirectory, 'generated'), {
    recursive: true,
  });
  writeFileSync(
    join(prismaDirectory, 'consumer.mjs'),
    `
import assert from 'node:assert/strict';
const adapter = await import('@1hubengineering/adapter-prisma');
assert.deepEqual(Object.keys(adapter).sort(), ['prismaStorage', 'prismaTransaction']);
assert.throws(() => adapter.prismaStorage({}), /Prisma 7.10.1 receipt model/);
`,
  );
  run(process.execPath, ['consumer.mjs'], prismaDirectory);
  const prismaTypes = readFileSync(
    join(root, 'tests/adapter-contract/src/prisma-types.ts'),
    'utf8',
  ).replaceAll("'../generated/", "'./generated/");
  writeFileSync(join(prismaDirectory, 'consumer.ts'), prismaTypes);
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
      '--allowImportingTsExtensions',
      '--types',
      'node',
      '--typeRoots',
      join(root, 'node_modules/@types'),
      join(prismaDirectory, 'consumer.ts'),
    ],
    prismaDirectory,
  );
  console.log(
    'Packed npm consumer: ESM comparison, exact money, declarations, and dependency boundary passed.',
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
