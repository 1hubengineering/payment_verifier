Configure the verifier on your server. The core is ESM-only, reads no environment files, and opens no connections.

Authenticate the caller first. Look up the authorized order and pass the host's tenant, payment ID, provider, expected recipient and exact integer ETB minor units to `createPaymentExpectation`. Do not take those values from the receipt submission. Register the immutable expectation before accepting a locator.

Build the verifier with `createReceiptVerifier({ storage, providers })`. Configure only the server-side providers you intend to support and share one claim store across workers. Send the locator with a tenant-scoped idempotency key. See the [published configuration example](https://github.com/1hubengineering/payment_verifier/blob/v0.1.1/packages/receipt-verifier/README.md#configured-verifier).

| Status                 | How to handle it                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `MATCHED_RECEIPT_ONLY` | Evidence matched. The configured verifier can record a local claim. Check settlement separately before authorizing fulfillment. |
| `MISMATCHED`           | Complete evidence disagreed with the trusted order. Ask the customer to check the reference or method.                          |
| `UNABLE_TO_VERIFY`     | Evidence was unavailable, invalid, missing or ambiguous. Do not treat it as a mismatch.                                         |
| `ALREADY_CLAIMED`      | The payment already has a claim or this provider receipt was already claimed in the shared store.                               |
| `CANCELLED`, `EXPIRED` | Stop and consult the host order state.                                                                                          |
| `NEEDS_REVIEW`         | Send the attempt to your review flow. Keep settlement unconfirmed.                                                              |
| `IDEMPOTENCY_CONFLICT` | The key was reused for different input. Do not retry that conflicting request with the same key.                                |

All receipt results retain settlement `UNCONFIRMED`. Authenticate and authorize any later settlement or delivery action separately.
