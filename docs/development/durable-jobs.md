# Durable verification jobs

The `@1hubengineering/verifier/jobs` entry shares verification storage, trusted
expectations, and configured providers with synchronous submission. Constructing it has no
I/O. Initialize explicitly after provisioning the versioned record tables.

```ts
const jobs = createDurableVerifier({ storage, providers, encryptionKey });
await jobs.initialize();
const accepted = await jobs.enqueue({ tenantId, paymentId, idempotencyKey, receiptLocator });
await jobs.runOnce({ signal: shutdownSignal });
const status = await jobs.status({ tenantId, paymentId }, accepted.jobId);
```

Authenticate and authorize tenant/payment access before calling these APIs. The order owns
the payment expectation. Scoped status returns job identity, timings, and the terminal result
or safe operation error. `QUEUED`, `RUNNING`, and `RETRY_WAIT` are pending states. `COMPLETED`
holds a `VerificationResult`. `FAILED` holds a serialized `VerificationOperationError`.

## Admission and replay

Acceptance commits the job and tenant-scoped idempotency binding. Identical canonical inputs
coalesce while a job is pending, with at most eight aliases per job. A fresh key can
create a new job after a terminal outcome if the expectation still permits verification.
Previously bound keys replay the original observation. A different canonical identifier under
the same key yields `IDEMPOTENCY_CONFLICT`. A synchronous caller receives `JOB_IN_PROGRESS` for a
key with queued work, or replays the committed result for a completed job. Invalid input can
complete at admission without provider work.

The queue encrypts the canonical identifier, original input format, and primary key using
AES-256-GCM. Associated data binds the job and expectation snapshot. Terminal records remove
ciphertext. Raw SMS and plaintext idempotency keys stay out of storage.

## Execution and recovery

The defaults are 100 pending jobs, 1,000 retained jobs, one concurrent provider request,
three attempts, a 15-second provider timeout, a 30-second lease, and one-second initial
backoff. The store coordinates admission and leases across workers. Provider work stays
outside transactions. The final transaction rechecks the snapshot and unexpired lease, and
commits job state with any claim, attempt, and outbox event.

Retry scheduling respects the typed retry recommendation, configured attempt budget,
bounded exponential backoff and provider delay hints, and expectation deadline. Retryable
intermediate results roll back before `RETRY_WAIT` is persisted. A process crash leaves
the lease recoverable. Exhausted crashes without a completed receipt observation produce
`QUEUE_ATTEMPTS_EXHAUSTED`. Hosts supervise processes, handle shutdown, keep host clocks
synchronized, and configure provider timeouts below lease duration.

## Retention and keys

Acknowledge outbox events after a repeat-safe consumer succeeds. The trusted
`pruneCompleted(before, limit)` operation removes acknowledged terminal jobs from active
queue capacity. Replay bindings and terminal summaries stay available by the original key
and are independent of active queue limits. Manage their long-term retention with the host's
storage policy. Claim uniqueness is scoped to the shared store.

Use the same securely generated 32-byte key and policy across workers. Stop and drain
workers before changing the key. Keep the archived development key separately from its
database backup and follow the [0.2.0 development cutover](plans/017-verification-contract-0.2.0.md).
