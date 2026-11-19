Recover a dropped response or `STORAGE_OUTCOME_UNKNOWN` by submitting the original
authorized request with the same idempotency key. A committed attempt replays its
stored result when the canonical locator matches. Reuse with a different valid
locator returns `IDEMPOTENCY_CONFLICT`. Input validation can return
`INVALID_INPUT` before checking the key in the published package, so recover
using the original evidence.

For a known committed unverified result, start a fresh attempt with a new key
when its `retryable` flag and the host order state allow it. Concurrent
synchronous requests may retrieve separately before the first commit. Apply
host admission limits and replay by key after a response loss.

When using a caller-owned transaction, roll back if completion rejects. Retry
the entire transaction after a retryable storage conflict. Release business
effects only after the outer transaction commits.

For restart-safe work, use the published `@1hubengineering/verifier/jobs` entry
with the same store and encryption configuration across workers. Set queue and
retention bounds and acknowledge processed events before pruning completed jobs.
See [durable-job configuration](https://github.com/1hubengineering/payment_verifier/blob/a876f119fa0da2670b7b2312698cbd538f676b9a/docs/development/durable-jobs.md).
