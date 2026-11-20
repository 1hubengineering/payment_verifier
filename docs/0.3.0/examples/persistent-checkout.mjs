import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { sqliteStorage } from '@1hubengineering/storage-sql/sqlite';
import {
  createPaymentExpectation,
  createReceiptVerifier,
  parseEtbAmount,
  VerificationOperationError,
} from '@1hubengineering/verifier';

if (process.argv.length !== 3) throw new Error('Pass a new, empty scratch directory.');
const directory = process.argv[2];
// Connect to separate, host-owned business and verifier databases.
const business = new Database(join(directory, 'orders.sqlite'));
const records = new Database(join(directory, 'verifier.sqlite'));
const now = Date.UTC(2026, 0, 1, 12);
const validFrom = now - 60_000;
const validUntil = now + 3_600_000;
const buyer = { tenantId: 'demo-shop', customerId: 'demo-buyer' };

try {
  business.exec(`
    CREATE TABLE orders (
      tenant TEXT NOT NULL, id TEXT NOT NULL, customer TEXT NOT NULL,
      provider TEXT NOT NULL, price TEXT NOT NULL, merchant TEXT NOT NULL,
      suffix TEXT NOT NULL, note TEXT NOT NULL, valid_from INTEGER NOT NULL,
      valid_until INTEGER NOT NULL, state TEXT NOT NULL,
      verification_id TEXT, received_minor INTEGER, PRIMARY KEY (tenant, id)
    );
    CREATE TABLE fulfillment_requests (
      tenant TEXT NOT NULL, order_id TEXT NOT NULL, verification_id TEXT NOT NULL,
      PRIMARY KEY (tenant, order_id)
    );
  `);
  const seed = business.prepare(
    "INSERT INTO orders VALUES (?, ?, ?, 'telebirr', '250.00', 'Example Shop', '1048', ?, ?, ?, 'PENDING', NULL, NULL)",
  );
  seed.run(buyer.tenantId, 'order-1', buyer.customerId, 'INV-DEMO-1', validFrom, validUntil);
  // An accidental duplicate expectation lets the demo exercise the global claim in this store.
  seed.run(buyer.tenantId, 'order-2', buyer.customerId, 'INV-DEMO-1', validFrom, validUntil);
  const authorizedOrder = business.prepare(
    'SELECT * FROM orders WHERE tenant = ? AND id = ? AND customer = ?',
  );

  const storage = sqliteStorage(records);
  await storage.migrate();
  let lookups = 0;
  const telebirrFixture = {
    async retrieve(url) {
      assert.match(url, /^https:\/\/transactioninfo\.ethiotelecom\.et\/receipt\//);
      const transactionId = url.split('/').at(-1);
      lookups += 1;
      if (transactionId === 'DEMOTIMEOUT1' && lookups === 1) {
        return {
          kind: 'UNAVAILABLE',
          code: 'PROVIDER_TIMEOUT',
          stage: 'receipt_retrieval',
          retryable: true,
          details: {},
        };
      }
      return {
        kind: 'EVIDENCE',
        evidence: {
          provider: 'telebirr',
          currency: 'ETB',
          transactionId,
          status: 'SUCCESSFUL',
          amountMinor: parseEtbAmount(transactionId === 'DEMOWRONG1' ? '200.00' : '250.00'),
          recipientName: 'Example Shop',
          recipientAccountLast4: '1048',
          reference: 'INV-DEMO-1',
          transactionAt: now,
          paymentType: null,
          ambiguousFields: [],
        },
        // Synthetic provenance for the injected adapter. No network fetch occurs.
        provenance: {
          kind: 'OFFICIAL_HTTPS',
          url,
          retrievedAt: now,
          parserVersion: 'synthetic-checkout-fixture',
          sha256: createHash('sha256')
            .update('synthetic:' + transactionId)
            .digest('hex'),
        },
      };
    },
  };
  const verifier = createReceiptVerifier({
    storage,
    providers: { telebirr: telebirrFixture },
    now: () => now,
  });
  await verifier.initialize();

  // Request handlers receive an already authenticated session from the host.
  async function verifyEvidence(session, paymentId, idempotencyKey, receiptLocator) {
    const order = authorizedOrder.get(session.tenantId, paymentId, session.customerId);
    if (!order) throw new Error('Order not found');
    await verifier.registerExpectation(
      createPaymentExpectation({
        tenantId: order.tenant,
        paymentId: order.id,
        provider: order.provider,
        currency: 'ETB',
        amountMinor: parseEtbAmount(order.price),
        recipientName: order.merchant,
        recipientAccountLast4: order.suffix,
        reference: order.note,
        validFrom: order.valid_from,
        validUntil: order.valid_until,
      }),
    );
    return verifier.submit({
      tenantId: order.tenant,
      paymentId: order.id,
      idempotencyKey,
      receiptLocator,
    });
  }

  const applyVerified = business.transaction((session, result) => {
    const order = authorizedOrder.get(session.tenantId, result.paymentId, session.customerId);
    if (!order || order.tenant !== result.tenantId || result.status !== 'VERIFIED') {
      throw new Error('Cannot apply this verification to the order');
    }
    if (order.state === 'VERIFIED' && order.verification_id === result.verificationId) return;
    const update = business
      .prepare(
        "UPDATE orders SET state = 'VERIFIED', verification_id = ?, received_minor = ? WHERE tenant = ? AND id = ? AND state = 'PENDING'",
      )
      .run(result.verificationId, result.receipt.amountMinor, order.tenant, order.id);
    assert.equal(update.changes, 1);
    business
      .prepare('INSERT INTO fulfillment_requests VALUES (?, ?, ?)')
      .run(order.tenant, order.id, result.verificationId);
  });

  const submit = (key, evidence, order = 'order-1') => verifyEvidence(buyer, order, key, evidence);
  const state = () => authorizedOrder.get(buyer.tenantId, 'order-1', buyer.customerId).state;
  const timeout = await submit('first', 'Transaction ID: DEMOTIMEOUT1');
  assert.equal(timeout.status, 'UNAVAILABLE');
  assert.equal(timeout.code, 'PROVIDER_TIMEOUT');
  assert.equal(timeout.retryable, true);
  assert.equal(state(), 'PENDING');
  console.log('We could not check your receipt yet. Please do not pay again for this order.');

  assert.deepEqual(await submit('first', 'DEMOTIMEOUT1'), timeout);
  assert.equal(lookups, 1);
  assert.equal(
    (await submit('bad-input', 'https://example.invalid/receipt')).status,
    'INVALID_INPUT',
  );
  assert.equal((await submit('wrong-amount', 'DEMOWRONG1')).code, 'AMOUNT_UNDERPAID');

  // A deliberate new observation uses a fresh key after the known timeout result.
  const committed = await submit('second', 'DEMOTIMEOUT1');
  assert.equal(committed.status, 'VERIFIED');
  assert.equal(state(), 'PENDING'); // Simulate a lost response before applying the order update.
  const recovered = await submit('second', 'DEMOTIMEOUT1');
  assert.deepEqual(recovered, committed);
  applyVerified.immediate(buyer, recovered);
  applyVerified.immediate(buyer, recovered);
  assert.equal(state(), 'VERIFIED');
  assert.equal(
    business.prepare('SELECT count(*) AS total FROM fulfillment_requests').get().total,
    1,
  );
  assert.equal(lookups, 3);
  console.log('VERIFIED recovered using the original key. One fulfillment request recorded.');

  const hasCode = (code) => (error) =>
    error instanceof VerificationOperationError && error.code === code;
  await assert.rejects(
    submit('second', 'https://example.invalid/receipt'),
    hasCode('IDEMPOTENCY_CONFLICT'),
  );
  await assert.rejects(
    submit('duplicate', 'DEMOTIMEOUT1', 'order-2'),
    hasCode('RECEIPT_ALREADY_CLAIMED'),
  );
  assert.equal(authorizedOrder.get(buyer.tenantId, 'order-2', buyer.customerId).state, 'PENDING');
  await assert.rejects(
    verifyEvidence({ ...buyer, customerId: 'other' }, 'order-1', 'blocked', 'DEMOTIMEOUT1'),
    /Order not found/,
  );
  console.log('Bound-key conflict, duplicate claim and unauthorized order were rejected.');
} finally {
  records.close();
  business.close();
}
