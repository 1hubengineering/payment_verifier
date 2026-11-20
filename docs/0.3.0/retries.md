> An inconclusive verification does not prove that the customer failed to pay.
> A timeout alone must not trigger a request for another payment.

Keep the order in an application-owned pending or review state. Show the
customer the progress your system actually knows. For a timeout, use “We could
not check your receipt yet. Please do not pay again for this order.” For a
technical problem, offer your merchant's existing support channel. Only say
that a retry was scheduled, an order was saved, or a notification will arrive
when your application has actually arranged it.
[Results and operation errors](configuration.md) · [Troubleshooting](troubleshooting.md)

## Idempotency

| Situation                                                | Action                                                                                                                                                                                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Response lost or commit uncertain                        | Authorize the same order again and submit the original evidence with the original key, or repeat durable admission with that key. A lost outer-transaction response also requires checking the host's own transaction outcome. |
| Completed attempt replayed                               | The same canonical locator, scope and key return the stored result or terminal job outcome. The retrieval time and result reflect the original observation.                                                                    |
| Known completed result and another lookup is appropriate | Create a fresh attempt with a fresh key on the same authorized payment while the expectation is open. Follow the outcome's retry recommendation and the host's attempt budget.                                                 |
| Bound key with changed or malformed evidence             | Expect `IDEMPOTENCY_CONFLICT`. Equivalent presentations of the same canonical locator, such as supported SMS and plain ID, can replay. Reserve new keys for deliberate observations after a known outcome.                     |
| Repeated delivery of a verified result                   | Apply the order update and any fulfillment intent with their own stable unique keys. SDK idempotency protects SDK writes.                                                                                                      |

Keys are scoped by tenant and bind to a payment and canonical locator.
Keep the key and original logical submission available before the first
request when recovery must survive a client restart.
Durable admission also remembers invalid input by a protected fingerprint
and can replay the same rejected admission. A changed fingerprint conflicts.
Concurrent synchronous submissions can perform separate retrievals before
the first commit. The store serializes completion. A scoped transaction
conflict requires rollback and a whole-transaction retry. See the
[checkout example](checkout.md) and [storage boundaries](storage.md).

## Choose an execution model

- **Synchronous submission** fits interactive work within the request deadline.
  The app handles retries and backpressure. Use short, bounded attempts and
  exponential backoff with jitter for transient failures. Respect provider
  delay hints and the expectation window. Avoid tight retry loops.
- **SDK durable jobs** persist acceptance, retries, leases and terminal
  outcomes in the verifier store. Use them when work must survive request
  deadlines and process restarts. Your app runs the workers and exposes
  authorized progress. Use a shared 32-byte encryption key and consistent
  policy across all instances.
- **Existing application queue** can call the SDK with its normal submission
  and recovery model. Persist the original scope and key securely. Decide
  which layer schedules a fresh observation so two retry loops do not
  multiply the work.

With `createDurableVerifier` from `@1hubengineering/verifier/jobs`, call
`initialize()`, `enqueue(submission)` and poll
`status({ tenantId, paymentId }, jobId)` after authorizing that scope.
Run `runOnce({ signal })` from a supervised host worker. The queue tracks
`QUEUED`, `RUNNING`, `RETRY_WAIT`, `COMPLETED` and `FAILED`. These are job
states. `COMPLETED` includes a verification result, and `FAILED` a serialized
operation error. The queue bounds pending jobs, retained jobs, aliases,
concurrency and attempts. It reclaims expired leases and fences stale workers.
It schedules eligible retries within its time and attempt budgets. Acknowledge
outbox events only after their repeat-safe host processing, then prune eligible
terminal jobs using `pruneCompleted(before, limit?)`. Replay bindings survive.
[Durable-job configuration and defaults](../development/durable-jobs.md)

When retries exhaust or evidence stays incomplete, stop automated attempts.
Use merchant records or the merchant's provider support to reconcile privately.
Keep order state and retry visibility in your application. The queue handles
verification work. The host handles customer notifications and escalation.
[Security and privacy](security.md)
