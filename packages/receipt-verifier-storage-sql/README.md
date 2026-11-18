# Direct SQL receipt storage

Version 0.1.0. The shared contract suite passes on PostgreSQL 18.7
with pg 8.23.1, MySQL 8.4.13 with mysql2 3.24.6, and SQLite 3.54.1 with
better-sqlite3 13.2.0. Kysely 0.29.9 is an internal query/transaction boundary.
Other versions, platforms and ORM clients are not implied by these results.

Install this package and only your chosen driver. Driver peers are optional and
versioned; the core has no driver dependencies. Import the selected subpath:

```ts
import { Pool } from 'pg';
import { postgresStorage } from '@1hubengineering/receipt-verifier-storage-sql/postgres';
import { createReceiptVerifier } from '@1hubengineering/receipt-verifier';
import { retrieveTelebirr } from '@1hubengineering/receipt-verifier/providers';

const pool = new Pool({ connectionString: trustedDatabaseUrl }); // host configuration
const storage = postgresStorage(pool);
await storage.migrate(); // deployment/migration owner, before serving traffic
const verifier = createReceiptVerifier({
  storage,
  providers: { telebirr: { retrieve: retrieveTelebirr } },
});
```

For MySQL use `mysqlStorage` and a callback-style mysql2 pool. For SQLite use
`sqliteStorage` and an existing better-sqlite3 database. Configure the SQLite
connection's journal/busy policy in the host; tests use WAL and bounded retries.
Adapters never close pools, clients or databases. Reuse the adapter for a connection;
do not run separate independent transaction managers on one SQLite connection.

Hosts authorize tenant/payment access and register validated expectation snapshots
from trusted order records. Re-registering an identical snapshot is repeatable;
changing its amount or recipient under the same identity is refused. Public
submissions contain only tenant/payment IDs, idempotency key and a receipt locator.
Provider instances are trusted server configuration and cannot be supplied by a
receipt submission. `submit` retrieves outside the short transaction, then rechecks
the stored expectation, cancellation, acceptance time and claim state before writes.

Only complete matching evidence from the configured provider's official-HTTPS
result can create a local claim. Saved-HTML provenance is rejected. One receipt
can be claimed once per provider across every tenant in this shared store; one
payment accepts one receipt. Independent stores do not coordinate receipt reuse.
Every outcome retains settlement `UNCONFIRMED`; there is no unchecked claim API.

Idempotency keys are scoped to the tenant and case-sensitive. Identical canonical
provider URL and payment ID replay the committed result without retrieving again.
Conflicting reuse returns `IDEMPOTENCY_CONFLICT` without exposing the original
payment. Timeouts persist `UNABLE_TO_VERIFY`, and a new key can request another
attempt. A matched receipt, normalized evidence, committed result and durable event
are written atomically; rollback leaves none of those partial effects behind.
Raw HTML and provider URLs are not stored in attempt records. Normalized receipt
fields still contain personal data; the host must apply its retention/access policy.

## Joining a host transaction

Prepare before opening the host transaction. Then bind the exact transaction
client and complete using the opaque in-process preparation token:

```ts
import { postgresTransaction } from '@1hubengineering/receipt-verifier-storage-sql/postgres';
const prepared = await verifier.prepare(authorizedSubmission);
const client = await pool.connect();
try {
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  const result = await verifier.complete(prepared, postgresTransaction(client));
  // Other receipt-related host writes on this same client can commit atomically.
  // Settlement and fulfillment require independent trusted confirmation.
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release(); // host ownership
}
```

MySQL supplies `mysqlTransaction` for an already-started mysql2 callback connection;
SQLite supplies `sqliteTransaction` for an already-started connection transaction.
Its constructor and every scoped read/transaction reject an inactive or ended
native transaction, preventing accidental autocommit through a stale scope.
PostgreSQL/MySQL raw-client helpers require the caller to keep the actual enclosing
transaction active and await all work before commit; no private driver state is inferred.
Kysely hosts can use `createSqlStorage` and `withTransaction` with the actual
transaction object. A plain Kysely handle is refused by `withTransaction`.
Raw PostgreSQL/MySQL callers must select Serializable for the actual enclosing
transaction. Scoped adapters issue no begin, commit, rollback or connection release. They refuse
provider preparation. The caller must retry its entire transaction on
`StorageConflict`; a returned result remains provisional until the caller commits.
Library-owned transactions retry serialization, deadlock, busy and uniqueness
conflicts at most eight times. Transaction callbacks must contain no external side
effects because retries may execute them again.

## Schema and migrations

`migrate` explicitly creates v1 `receipt_verifier_schema` (singleton version) and
`receipt_verifier_records` (`record_key` primary key, bounded JSON text payload).
Keys contain a versioned record kind and SHA-256 of canonical JSON identifiers.
ASCII lowercase keys make identity/claim behavior independent of engine collation.
The primary key enforces expectation, receipt-claim and idempotency uniqueness.
Records cover immutable expectations/state, claims, attempts/evidence/results and
durable events. This is the library's local schema design, not an ORM convention.

Run exactly one migration owner before traffic. Initial creation is restartable
and repeatable; MySQL DDL is not represented as an atomic rollback. Unknown schema
versions are refused. Migration verifies columns and primary-key enforcement with
a rolled-back duplicate probe. There is no prior released schema or upgrade path;
a future schema version must ship an explicit upgrade before it is supported.
Never edit or drop these constraints in a live installation.

`events` and `acknowledgeEvent` are trusted host/worker operations over the shared
store, with at-least-once delivery. Consumers must deduplicate by event key and
acknowledge only after their own durable action succeeds. Events communicate
receipt outcomes; they are never settlement or fulfillment instructions.

## Local proof

`pnpm db:up` starts only isolated PostgreSQL/MySQL test services with loopback ports,
synthetic development passwords and disposable tmpfs state. Override development
credentials through the environment when needed. `pnpm db:down` stops only that
Compose project. Never use application database URLs for the contract suite; its
runner refuses any host/database other than loopback `receipt_test`.

The same 26-case suite runs on every engine, including independent connections
and child processes racing at the commit boundary, caller rollback/commit,
mid-write failure, tenant isolation, response-loss replay after process restart,
immutable snapshots, missing/fabricated evidence and schema-version/constraint
checks. No live financial data or provider calls are used.

The shared suite also tests encrypted durable acceptance, queue/alias bounds,
retry rollback, persisted provider pause, lease fencing, atomic job completion,
retention and actual SIGKILL recovery/exhaustion on this integration.

For a given SQLite file, use only one native SQLite implementation in each
process. Opening better-sqlite3 13, Prisma's separate native build or libSQL
against that file together in one process is unsupported: SQLite documents
POSIX locking hazards for multiple linked copies. Run a different migration
owner in a separate process, then use the selected host ORM/client normally.
Our ORM tests isolate direct-SQL maintenance in short-lived processes and keep
actual ORM connections caller-owned throughout. Different processes coordinate
through the file's normal locks; no adapter reconnects a supplied client. See
[SQLite's locking guidance](https://www.sqlite.org/howtocorrupt.html#multiple_copies_of_sqlite_linked_into_the_same_application).
