# Optional durable jobs

## Outcome and scope

Expose an optional dependency-free `/jobs` entry using the same configured store,
providers and trusted expectations. Acknowledged work survives process restart;
leases fence stale workers, retry limits/backoff prevent storms, and claims,
results, outbox and terminal job state commit together. CLI/worker process entry
points follow in a separate slice after this shared durable API is proven.

## Evidence

The direct/Drizzle/Prisma nine-cell matrix passes 15 cases per cell. Its generic
versioned record store already provides Serializable transactions and bounded
JSON. Retrieval preparation is outside locks; completion can join a supplied
record transaction. Reuse these mechanisms without Redis or a second database.
Historical financial requirements require encrypted locators, bounded admission,
deduplication, recoverable leases and no receipt-to-settlement transition.

## Steps

- [x] Implement encrypted acceptance, scoped status, bounded deduplication/retention.
- [x] Add persisted leases, retry/backoff/circuit pause, stale-owner fencing.
- [x] Commit terminal jobs and existing verification effects in one transaction.
- [x] Extend every real-engine cell with durable jobs, faults and crash recovery.
- [x] Check installed job exports/types, review, document, pnpm verify and commit.

## Validation

Prove no retrieval before committed acceptance, conflicting idempotency privacy,
quota enforcement, encrypted locator/key storage and tenant-filtered status.
Prove retry rollback leaves no intermediate attempt/event, terminal retry exhaustion,
stale workers cannot commit, cancellation/snapshot changes fail closed, and
injected failure rolls back financial effects and job completion together.
Kill an actual worker process after leasing, recover after expiry and reconcile
every acknowledged job. Run the shared tests on all nine cells, plus full verify.

## Decisions

- Cap retained jobs at 1000 and pending jobs within that bound. This deliberately
  favors a small optional database-backed worker over a high-volume queue product.
- Serialize queue bookkeeping through one control record before scanning bounded
  jobs; transaction retries are owned by the selected adapter. This is a simple
  correctness boundary, not a throughput claim.
- Deduplicate canonical locator per tenant/payment; at most eight hashed
  idempotency aliases per retained job. Encrypt the primary key and canonical
  locator with AES-256-GCM, binding ciphertext to job/snapshot identity.
- Only prune completed jobs after their durable outbox event is acknowledged.
  Never prune claims or committed verification results. Host chooses retention,
  backups, auth/rate limits and repeat-safe event delivery.
- Persist policy/key fingerprint; mismatched workers fail configuration checks.
  Key rotation requires a drained, pruned queue, stopped old workers and explicit
  removal of its control record through the host migration/maintenance process.
- Supplied providers are trusted plugins and must honor retrieval timeout/abort.
  Built-in HTTPS/browser implementations already enforce those bounds. Local and
  shared-store admission bound concurrency; leases bound recovery and fence late
  completions. Host clock synchronization affects recovery latency.

## Handoff

The shared suite now passes 234 cases (26 per cell): its original 15 plus 11
durable-job cases. Each cell kills real child processes after persisted lease
acquisition, recovers work and proves three crashed attempts terminate without a
fourth provider request. Independent stale owners, final-write rollback,
configuration mismatch, ciphertext corruption, snapshot change during retrieval,
provider pause, quota/alias bounds and acknowledged-event retention all pass.
`pnpm verify` passed on Node 26.13.1: 211 fast/provider tests, 234 real-engine
contract cases, 11 frozen reference tests, builds/lint/types/publint and all
isolated npm consumers. The installed core exports `/jobs` without I/O or
dependencies; its strict types and real installed SQLite queue completion pass.
Review against code-review.md confirmed retrieval outside locks, atomic terminal
effects, tenant-filtered safe results, encrypted input and fail-closed recovery.
Runnable apps follow after this API slice; no public release or live-provider
behavior is claimed. Hosted two-runtime acceptance is pending for this commit.
