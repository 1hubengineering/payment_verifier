# @andhub/receipt-verifier

Private development preview. Exact ETB parsing, trusted expectation snapshots,
and pure receipt comparison are implemented. Retrieval and storage remain planned.

```ts
import { parseEtbAmount, createPaymentExpectation, compareReceipt } from '@andhub/receipt-verifier';

// Load these values from authorized host records, never receipt submissions.
const expectation = createPaymentExpectation({
  tenantId: 'synthetic-merchant',
  paymentId: 'synthetic-payment',
  provider: 'telebirr',
  currency: 'ETB',
  amountMinor: parseEtbAmount('500.00'),
  recipientName: 'Synthetic Merchant',
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
  amountMinor: parseEtbAmount('500.00'),
  recipientName: 'Synthetic Merchant',
  recipientAccountLast4: '1234',
  reference: 'ORDER_1234',
  transactionAt: 1700000030000,
  paymentType: null,
  ambiguousFields: [],
});
// result.verificationStatus === 'MATCHED_RECEIPT_ONLY'
// result.settlementStatus === 'UNCONFIRMED'
```

The host owns authentication and payment authorization. Expectation construction
validates and freezes a copy; comparison revalidates even untyped input. Only
canonical decimal ETB text is parsed: positive, at most two decimals, within safe
integer minor units. No rounding, separators, symbols or whitespace.

Time bounds and evidence timestamps are integer epoch milliseconds, inclusive at
both endpoints. Provider extraction must validate original dates/timezones before
normalizing them. There is no ambient clock, timezone assumption, or expiry of a
submission based on when comparison runs. The future storage workflow must recheck
payment state separately before accepting a claim.

Names normalize whitespace and case; suffixes and references compare exactly.
A four-digit suffix does not prove full receiving-account identity. The transaction
ID must be normalized uppercase ASCII, 6–40 characters including `_` or `-`.
CBE requires payment type `A2A`. Every provider requires successful status, exact
amount and currency, recipient, reference, transaction ID and timestamp.

Parsers must list contradictory fields in `ambiguousFields`; malformed ambiguity
metadata fails closed. Missing, invalid or ambiguous required evidence returns
`UNABLE_TO_VERIFY`, including when another field mismatches. Complete conflicting
evidence returns `MISMATCHED`. Results include per-field checks without echoing
sensitive values. `paymentType` is checked only for CBE.

This pure API compares supplied evidence and cannot establish authenticity. Saved
HTML or fabricated normalized fields can match. Matching never claims a transaction,
confirms settlement, credits a wallet, or authorizes fulfillment. There is no public
unchecked claim API.

The core has no runtime dependencies and performs no import-time I/O. ESM only.
Supported runtime ranges are `^24.22.3 || ^26.13.1`; CI is configured for both
minimums. Development uses Node 26 LTS. Database and ORM compatibility is planned.
