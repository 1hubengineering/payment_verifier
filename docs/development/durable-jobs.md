# Optional durable verification jobs

The private `/jobs` entry reuses the same VerificationStorage, v1 migration,
trusted expectations and configured providers as direct verification. It has no
npm runtime dependencies. Imports and construction perform no I/O. Call
initialize explicitly before admission or worker execution. Every worker must use
the same policy and 32-byte secret; initialization refuses mismatches.

```ts
import { createDurableVerifier } from '@1hubengineering/verifier/jobs';

const jobs = createDurableVerifier({
  storage, // an unscoped configured adapter; host retains its connections
  providers, // trusted, bounded provider implementations
  encryptionKey, // 32 cryptographically random bytes supplied by the host
});
await jobs.initialize();
// Host authenticates and authorizes tenant/payment before calling these APIs.
const accepted = await jobs.enqueue({
  tenantId,
  paymentId,
  idempotencyKey,
  receiptLocator,
});
// Return acceptance only after this commit, then run in a separate worker:
await jobs.runOnce({ signal: shutdownSignal });
const status = await jobs.status({ tenantId, paymentId }, accepted.jobId);
```

Only a stored OPEN expectation can admit new work. The accepted expectation's
digest is checked again before retrieval and inside completion. Changed snapshots
or damaged authenticated ciphertext produce NEEDS_REVIEW and an operator event,
never a claim. Cancellations and expiry retain their normal verifier meanings.
No accepted job can supply expected amounts, recipient identity or order authority.

Acceptance commits the job and hashed tenant-scoped idempotency alias before it
returns; it never retrieves provider evidence. Canonically identical locators for
one tenant/payment return the same retained job, including under new aliases.
Conflicting reuse fails without returning the original scope or job. Each job
permits at most eight aliases. The canonical locator and primary idempotency key
are encrypted with AES-256-GCM using a random nonce; associated data binds the job
and accepted snapshot. Neither raw SMS nor plaintext URLs/keys are persisted.
Ciphertext is erased on completion. Scoped status returns only state, attempt
count, timing and the safe verifier result; it omits ciphertext and lease tokens.

One control record serializes bounded bookkeeping before each job transition.
The default maximum is 100 pending and 1000 retained jobs, concurrency 1 (maximum
4), three attempts, 15-second provider timeout, 30-second lease and one-second
initial backoff. Counts and concurrency are shared by every queue worker using
that store, not just one object. Lease acquisition commits before provider work.
A cryptographically random lease token and unexpired lease are rechecked inside
the final transaction. Another worker can reclaim an expired lease; a late former
owner returns STALE and cannot commit verification effects.

Provider retrieval happens outside storage transactions. Terminal job state,
claim, normalized evidence, idempotency result and outbox commit through one
actual adapter transaction. A failure rolls all of them back and leaves the lease
recoverable. Missing/incomplete parsed evidence is a terminal unverified result;
unavailability with no field checks retries. An unavailable retry rolls back its
intermediate verification result/event, then persists RETRY_WAIT and backoff.
A crash between those operations leaves a recoverable RUNNING lease. Backoff is
exponential up to 60 seconds, with up to 25% jitter. Three consecutive unavailable
attempts pause that provider until the persisted retry time. Other workers observe
the same pause. Crash attempts count toward the bound; after the final abandoned
lease, recovery completes UNABLE_TO_VERIFY without another provider request.

A process admits at most its configured runOnce concurrency, and the shared
lease count bounds live leases. Built-in providers honor timeout/abort; custom
trusted plugins must do so too. A lease does not remotely kill an unhealthy
process or an arbitrary plugin ignoring cancellation. Keep provider timeout below
lease duration; synchronized host clocks affect recovery latency. This small,
serial queue intentionally makes no high-volume throughput or live-provider SLO
claim. Hosts own polling, process supervision, shutdown, backups, authentication,
rate limiting and independent settlement/fulfillment decisions.

Retained jobs continue to count toward admission until explicit pruning. The
trusted maintenance API pruneCompleted(before, limit) deletes only completed jobs
older than the host's retention cutoff whose durable event has been acknowledged.
It deletes associated aliases, never claims or committed verification results.
Outbox delivery remains at-least-once; hosts acknowledge only after a repeat-safe
consumer succeeds. Queue alias deduplication ends at pruning; financial claim
protection remains. Other financial records and expectations need the host's own
retention policy; a bounded queue does not cap the entire database's lifetime.

Generate the key outside the library and back it up securely. Losing it makes
pending jobs unreadable and requires operator review. Rotation requires stopped
workers and a drained, pruned queue, then explicit removal of the jobcontrol
record through a trusted host maintenance transaction before initializing the new
key/policy. Never delete this record while jobs remain or to evade capacity.
The key used in synthetic tests is public test data and must never be deployed.
