# Schema ownership and migrations

Version 1 is the first library schema. It contains receipt_verifier_schema
(singleton id=1, version=1) and receipt_verifier_records (record_key primary key,
bounded JSON payload). Keys are canonical versioned hashes, so claim/idempotency
identity does not depend on database collation. Expectations, normalized evidence,
claims, results, events and optional jobs share this one store. Independent stores
do not coordinate receipt reuse. No historical CLI claim database is imported.

Choose one migration owner and run it explicitly before traffic. The direct SQL
adapter exposes migrate() on its configured pg/mysql2/better-sqlite3 storage.
It creates tables idempotently, refuses unknown metadata versions, verifies expected
columns and probes primary-key enforcement in a rolled-back transaction. MySQL
DDL commits implicitly; creation is restartable, not an atomic rollback promise.
Do not run competing migration owners or change constraints in a live store.

Drizzle exports versioned table definitions and Prisma ships model snippets for
all three engines. Tests generate actual Prisma clients from those snippets and
query the same v1 tables. A host can incorporate definitions into its own migration
workflow after reviewing its SQL; no Drizzle Kit or Prisma Migrate automation is
advertised as validated. The supported shared migration owner is the direct SQL
v1 migration. For ORM SQLite using another native build, run that owner in a
separate process; never hold both native implementations against one file in the
same process. The shared tests exercise exactly this separation.

There is no prior released schema to upgrade. A future schema version must include
an explicit upgrade and data/recovery tests before being supported. Do not edit
version metadata to bypass compatibility checks. Back up the store with the engine's
supported consistent backup method, verify restoration and stop work during host
maintenance as needed. File copies of an active SQLite/WAL database are not a
backup procedure supplied by this library.

Optional jobs use v1 records and require no second queue/database. They have an
explicit policy/key fingerprint and bounded retention; read durable-jobs.md before
initializing, rotating keys or pruning. Financial claims and committed verifier
results are never removed by queue pruning. Events remain at-least-once and must
be acknowledged only after the host's repeat-safe consumer succeeds. Receipt events
never authorize credit, settlement confirmation or delivery.

Caller-scoped completion must use the actual active host transaction after provider
preparation finishes. The result is provisional until host commit. Raw pg/mysql2
callers own BEGIN/isolation/commit/rollback/whole-transaction retries. SQLite scopes
check native transaction activity at construction and use; Drizzle checks actual
transaction objects; Prisma requires its explicit Serializable policy and actual
callback tx. No adapter releases or closes a supplied connection, pool or client.
