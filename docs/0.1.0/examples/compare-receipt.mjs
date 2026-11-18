import assert from 'node:assert/strict';
import {
  compareReceipt,
  createPaymentExpectation,
  parseEtbAmount,
} from '@1hubengineering/receipt-verifier';

const amountMinor = parseEtbAmount('500.00');
const expectation = createPaymentExpectation({
  tenantId: 'demo-shop',
  paymentId: 'demo-order',
  provider: 'telebirr',
  currency: 'ETB',
  amountMinor,
  recipientName: 'Demo Shop',
  recipientAccountLast4: '1234',
  reference: 'ORDER_1234',
  validFrom: 1700000000000,
  validUntil: 1700000060000,
});

const result = compareReceipt(expectation, {
  provider: 'telebirr',
  currency: 'ETB',
  transactionId: 'SYNTH1234',
  status: 'SUCCESSFUL',
  amountMinor,
  recipientName: 'Demo Shop',
  recipientAccountLast4: '1234',
  reference: 'ORDER_1234',
  transactionAt: 1700000030000,
  paymentType: null,
  ambiguousFields: [],
});

assert.equal(result.verificationStatus, 'MATCHED_RECEIPT_ONLY');
assert.equal(result.settlementStatus, 'UNCONFIRMED');
console.log(`${result.verificationStatus} / ${result.settlementStatus}`);
