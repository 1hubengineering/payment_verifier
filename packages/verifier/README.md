# @1hubengineering/verifier

Payment Verifier checks Telebirr and CBE receipts against trusted order data in a Node.js backend.
The host supplies a configured storage adapter, provider adapters, and its own payment expectations.

**0.2.0 requires a fresh verifier store for new installations.** Keep active 0.1.1 stores on
0.1.1 until a supported cutover preserves their existing receipt claims. Rehearse the
[development cutover](https://github.com/1hubengineering/payment_verifier/blob/main/docs/development/plans/017-verification-contract-0.2.0.md#development-and-testing-store-cutover)
with disposable test data.

```ts
import { createReceiptVerifier, VerificationOperationError } from '@1hubengineering/verifier';
import { retrieveTelebirr } from '@1hubengineering/verifier/providers';
// For CBE, configure createCbeProvider() from @1hubengineering/provider-cbe.

const verifier = createReceiptVerifier({
  storage,
  providers: { telebirr: { retrieve: retrieveTelebirr } },
});
await verifier.initialize();
await verifier.registerExpectation(order.paymentExpectation);
try {
  const result = await verifier.submit({
    tenantId: order.tenantId,
    paymentId: order.id,
    idempotencyKey,
    receiptLocator: buyerInput,
  });
  if (result.verified) {
    // The official receipt passed all required checks and the SDK committed the claim.
    await handleVerifiedPayment(result.verificationId);
  }
} catch (error) {
  if (error instanceof VerificationOperationError) logOperationError(error.toJSON());
  else throw error;
}
```

Hosts choose the provider and the expected amount, recipient, invoice reference, and payment
window from authorized records. Call `initialize()` after provisioning the storage tables.
It validates the record version and rejects legacy stores. Expectation creation validates and
freezes a copy. Use `parseEtbAmount` to convert canonical positive decimal ETB amounts to exact
integer minor units.

## Receipt input

Provide a bare identifier, official receipt URL, or full SMS in `receiptLocator`. Telebirr uses a
transaction reference and CBE uses its case-sensitive `v2-…` lookup token. The browser-safe
`@1hubengineering/verifier/input` export provides optional `detectPaymentInput(text)` for format
feedback. The verifier repeats validation, checks the order's provider, and constructs the official
request from provider constants. Submitted text supplies the lookup identifier. Verification uses
the retrieved receipt and server-owned expectation.

## Results

| Status          | Meaning                                                                       |
| --------------- | ----------------------------------------------------------------------------- |
| `VERIFIED`      | The official receipt passed every required check and the claim committed.     |
| `MISMATCH`      | One or more required receipt fields failed a definite check.                  |
| `NOT_FOUND`     | A configured adapter recognized a provider-confirmed absence response.        |
| `UNAVAILABLE`   | Retrieval, rendering, parsing, or incomplete evidence prevented verification. |
| `INVALID_INPUT` | Input detection or validation against the order's provider failed.            |

Every result reports `verified`, `code`, `stage`, `message`, `retryable`, `checks`, and any
available receipt and source. Branch on `status` and `code`. Checks report the rule and bounded
expected and observed values. Account comparisons use the recipient's last four digits. CBE
requires an account-to-account payment and an official bank transaction ID independent of its
lookup token. `compareReceipt` and `parseReceiptHtml` are offline utilities. Pure comparison
returns `MATCH`, `MISMATCH`, or `INCOMPLETE`. Use
`@1hubengineering/verifier/comparison` for those pure comparison and ETB helpers in a
browser bundle. Official receipt retrieval and claims use the Node.js SDK.

Operation failures reject with `VerificationOperationError`. Use `toJSON()` for safe structured
diagnostics. They include expectation state, idempotency conflicts, duplicate claims, caller
cancellation, invalid adapter results, and storage failures. Built-in adapters classify an
unexplained HTTP 404 as `PROVIDER_HTTP_ERROR`. Provider tests use synthetic HTML and local mocks.

## Amount matching policy

Exact matching is the default. A host can set `amountPolicy` for an individual payment
or pass `defaultAmountPolicy` to `createPaymentExpectation`. The effective policy is
validated, normalized, and frozen with the expectation.

```ts
const amountPolicy = {
  mode: 'tolerance',
  underpayment: { type: 'fixed', maxMinor: 60 },
  overpayment: { type: 'percentage', percent: '0.50' },
} as const;

const expectation = createPaymentExpectation({
  ...trustedOrder,
  amountMinor: parseEtbAmount('100.55'),
  amountPolicy,
});
```

The example accepts 99.95 through 101.05 ETB inclusive. Percentage allowances use integer
basis points, rounded down to whole minor units. An omitted direction permits zero
difference. Tolerance defaults to a 10% cap in either direction. A trusted tolerance policy
can set `maxPercent` up to `100.00`. A range that includes a zero or negative payment, or
exceeds the safe integer limit, fails with `INVALID_AMOUNT_POLICY`.

Find the `amountMinor` entry in `result.checks` for the expected and observed values,
signed difference, inclusive range, effective policy, and whether tolerance was applied.
A definitive failure reports `AMOUNT_UNDERPAID` or `AMOUNT_OVERPAID`. A tolerated payment
retains the actual provider amount in the receipt. All other required checks still apply.
Hosts decide how to account for underpayments and overpayments.

## Transactions and retries

`prepare` retrieves outside the transaction and returns an opaque token owned by that verifier.
`complete` rechecks the expectation and commits the claim, attempt, and outbox event together.
When composing with a caller-owned transaction, publish the result and trigger business effects
after the outer commit. Roll back the outer transaction if completion rejects.

A canonical submission replays its original result under the same idempotency key. Retry a
known completed unverified outcome with a fresh key when appropriate. Use the original key to
recover from `STORAGE_OUTCOME_UNKNOWN` or response loss. `retryable` describes whether another
bounded verification may obtain a different observation without correcting an input or updating
the integration. The host owns authentication, fulfillment, and repeat-safe business effects.

An invalid synchronous submission with a new key leaves that key unbound. Invalid evidence on a
key already bound to an attempt or a durable job returns `IDEMPOTENCY_CONFLICT`. Replay durable
submissions through `enqueue` to retain its handling of completed invalid jobs. Concurrent
synchronous submissions can make separate provider requests before an attempt commits. Apply host
admission limits to bound provider traffic.

The `/jobs` entry takes the same trusted expectations, providers, and storage. It persists queue
admission, protects locator/key data before completion, bounds retries, and fences stale workers.
See [durable jobs](https://github.com/1hubengineering/payment_verifier/blob/main/docs/development/durable-jobs.md).

The dependency-free core has no import-time I/O. It builds ESM for Node
`^24.22.3 || ^26.13.1`. Engine and ORM support is recorded in the storage adapter documentation.
