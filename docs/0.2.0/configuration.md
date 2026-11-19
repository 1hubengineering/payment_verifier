Create one server-side verifier with `createReceiptVerifier({ storage, providers })`.
Initialize a fresh store, authenticate the caller, and load the authorized order.
Register an immutable expectation with the trusted provider, ETB amount in integer
minor units, recipient, account suffix, invoice reference, and validity window.

```ts
const result = await verifier.submit({
  tenantId: order.tenantId,
  paymentId: order.id,
  idempotencyKey,
  receiptLocator: buyerInput,
});
```

The SDK accepts a Telebirr transaction ID, CBE `v2-` token, official receipt URL, or
SMS with a recognizable locator. Use the browser-safe
`@1hubengineering/verifier/input` export for input feedback. The server validates
the locator against the registered provider and performs official retrieval.
Exact amount matching is the default. A trusted expectation can set fixed or
percentage allowances for underpayment and overpayment. The amount check
includes the accepted range and signed difference.

| Result          | Meaning                                                                       |
| --------------- | ----------------------------------------------------------------------------- |
| `VERIFIED`      | The official receipt passed the required checks and the claim committed.      |
| `MISMATCH`      | A required check found a definite disagreement.                               |
| `NOT_FOUND`     | A provider adapter recognized a confirmed absence response.                   |
| `UNAVAILABLE`   | Retrieval, rendering, parsing, or incomplete evidence prevented verification. |
| `INVALID_INPUT` | Input detection or expected-provider validation failed.                       |

Use `status` and `code` to handle outcomes. Results also carry the stage,
retryability, individual checks, and a receipt snapshot and provenance when
available. Operation failures reject with `VerificationOperationError`, including
duplicate claims and conflicting idempotency keys. Use `toJSON()` for structured
diagnostics. Settlement and fulfillment remain host decisions.

See the [published SDK source and usage example](https://github.com/1hubengineering/payment_verifier/blob/a876f119fa0da2670b7b2312698cbd538f676b9a/packages/verifier/README.md).
