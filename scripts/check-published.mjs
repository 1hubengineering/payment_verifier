import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const manifest = JSON.parse(readFileSync(process.argv[2], 'utf8'));
assert.equal(manifest.eligibleForPublish, true);
assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
const legacy = manifest.version === '0.1.0';
const scoped = (name) =>
  '@1hubengineering/' +
  (legacy ? `receipt-verifier${name === 'verifier' ? '' : `-${name}`}` : name);
const names = ['verifier', 'storage-sql', 'adapter-drizzle', 'adapter-prisma', 'provider-cbe'].map(
  scoped,
);
assert.deepEqual(manifest.packages.map((pkg) => pkg.name).sort(), [...names].sort());
let drizzlePeer;
for (const pkg of manifest.packages) {
  const response = await fetch('https://registry.npmjs.org/' + encodeURIComponent(pkg.name));
  assert.equal(response.status, 200, `${pkg.name}: registry metadata unavailable`);
  const document = await response.json(),
    version = document.versions?.[manifest.version];
  assert.ok(version, `${pkg.name}@${manifest.version}: not published`);
  assert.equal(version.dist.integrity, pkg.integrity);
  assert.ok(document.maintainers.some((owner) => owner.name === '1hubengineering'));
  assert.equal(version._npmUser.name, '1hubengineering');
  if (pkg.name === scoped('adapter-drizzle')) {
    drizzlePeer = version.peerDependencies?.['drizzle-orm'];
    assert.equal(typeof drizzlePeer, 'string');
    assert.ok(drizzlePeer.length > 0);
  }
  assert.equal(new URL(version.dist.tarball).origin, 'https://registry.npmjs.org');
  const tarball = await fetch(version.dist.tarball);
  assert.equal(tarball.status, 200);
  const bytes = Buffer.from(await tarball.arrayBuffer());
  assert.equal(createHash('sha256').update(bytes).digest('hex'), pkg.sha256);
  assert.equal('sha512-' + createHash('sha512').update(bytes).digest('base64'), pkg.integrity);
}
const directory = mkdtempSync(join(tmpdir(), 'receipt-registry-consumer-'));
try {
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  execFileSync(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
      '--prefer-online',
      ...names.map((name) => `${name}@${manifest.version}`),
      'better-sqlite3@13.2.0',
      `drizzle-orm@${drizzlePeer}`,
      '@libsql/client@0.17.4',
      '@prisma/client@7.10.1',
      'playwright@1.65.1',
    ],
    { cwd: directory, stdio: 'inherit' },
  );
  writeFileSync(
    join(directory, 'consumer.mjs'),
    `
import assert from 'node:assert/strict';
globalThis.fetch=()=>{throw new Error('Unexpected provider/import network');};
import Database from 'better-sqlite3';
const {createReceiptVerifier,createPaymentExpectation,parseEtbAmount}=await import('${scoped('verifier')}');
const {createDurableVerifier}=await import('${scoped('verifier')}/jobs');
const {sqliteStorage}=await import('${scoped('storage-sql')}/sqlite');
assert.equal(typeof (await import('${scoped('adapter-drizzle')}/sqlite')).drizzleSqliteStorage,'function');
assert.equal(typeof (await import('${scoped('adapter-prisma')}')).prismaStorage,'function');
assert.equal(typeof (await import('${scoped('provider-cbe')}')).createCbeProvider,'function');
const db=new Database(':memory:');
try{
 const storage=sqliteStorage(db);await storage.migrate();
 const providers={telebirr:{async retrieve(url){return {kind:'EVIDENCE',provenance:{kind:'OFFICIAL_HTTPS',url,retrievedAt:1500,sha256:'a'.repeat(64),parserVersion:'1'},evidence:{provider:'telebirr',currency:'ETB',transactionId:url.split('/').at(-1),status:'SUCCESSFUL',amountMinor:parseEtbAmount('0.29'),recipientName:'Synthetic Merchant',recipientAccountLast4:'1234',reference:'ORDER_1234',transactionAt:1500,paymentType:null,ambiguousFields:[]}};}}};
 const verifier=createReceiptVerifier({storage,providers,now:()=>1500});
 const expected=createPaymentExpectation({tenantId:'synthetic',paymentId:'first',provider:'telebirr',currency:'ETB',amountMinor:parseEtbAmount('0.29'),recipientName:'Synthetic Merchant',recipientAccountLast4:'1234',reference:'ORDER_1234',validFrom:1000,validUntil:2000});
 await verifier.registerExpectation(expected);
 const input={tenantId:'synthetic',paymentId:'first',idempotencyKey:'first',receiptLocator:'SYNTH1234'};
 const first=await verifier.submit(input);assert.equal(first.verificationStatus,'MATCHED_RECEIPT_ONLY');assert.equal(first.settlementStatus,'UNCONFIRMED');assert.deepEqual(await verifier.submit(input),first);
 await verifier.registerExpectation({...expected,paymentId:'queued'});
 const jobs=createDurableVerifier({storage,providers,encryptionKey:new Uint8Array(32).fill(1),policy:{maxAttempts:1},now:()=>1500});await jobs.initialize();
 const queued={...input,paymentId:'queued',idempotencyKey:'queued',receiptLocator:'OTHER1234'};
 const accepted=await jobs.enqueue(queued);assert.equal(accepted.state,'QUEUED');assert.equal(await jobs.runOnce(),'COMPLETED');
 const status=await jobs.status(queued,accepted.jobId);assert.equal(status.result.verificationStatus,'MATCHED_RECEIPT_ONLY');assert.equal(status.result.settlementStatus,'UNCONFIRMED');assert.equal((await verifier.events()).length,2);assert.equal(db.open,true);
}finally{db.close();}
`,
  );
  execFileSync(process.execPath, ['consumer.mjs'], { cwd: directory, stdio: 'inherit' });
  process.stdout.write(
    JSON.stringify({
      version: manifest.version,
      sourceCommit: manifest.sourceCommit,
      packages: names,
      registryOwnersAndIntegrity: true,
      installedReceiptAndDurableWorkflow: true,
    }) + '\n',
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
