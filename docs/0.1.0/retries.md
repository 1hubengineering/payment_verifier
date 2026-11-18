Retry according to what failed. A dropped response and a committed unavailable result are different cases.

- If a response is lost, resend the same authorized request with its original idempotency key. This can replay a committed result without fetching the receipt again.
- If a provider attempt finished with a committed `UNABLE_TO_VERIFY` result, use a new logical attempt and key after the provider recovers.
- If a caller-owned transaction returns `StorageConflict`, retry the whole transaction within your bounded policy. A result returned before commit does not prove the write survived.

For work that must survive a restart, use the `/jobs` exports from `@1hubengineering/receipt-verifier@0.1.0`. Use the same store as the verifier and the same encryption configuration across workers. Set queue and retention bounds, handle events repeat-safely, and acknowledge them before pruning completed jobs. See [durable job configuration and worker recovery](https://github.com/1hubengineering/payment_verifier/blob/v0.1.0/docs/development/durable-jobs.md).
