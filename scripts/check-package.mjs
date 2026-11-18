import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
assert.deepEqual(Object.keys(core).sort(), ['compareReceipt', 'createPaymentExpectation', 'parseEtbAmount']);
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
`,
  );
  run(process.execPath, ['consumer.mjs'], temporary);

  writeFileSync(
    join(temporary, 'consumer.ts'),
    `
import { parseEtbAmount, type EtbMinorUnits, type VerificationStatus, type SettlementStatus, createPaymentExpectation, compareReceipt, type ReceiptComparison, type ReceiptEvidence }  from '@andhub/receipt-verifier';
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
  console.log(
    'Packed npm consumer: ESM comparison, exact money, declarations, and dependency boundary passed.',
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
