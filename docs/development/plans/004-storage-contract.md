# Atomic storage and direct SQL

This slice is complete and included in [0.1.0](../releases/0.1.0.md). The acceptance
counts and next steps below record its original handoff; see the
[roadmap](../roadmap.md) for current scope.

## Outcome and scope

Slice 3 adds storage-backed verification using immutable host expectation records,
prepared provider evidence outside transactions, atomic local claims, idempotent
results and durable events. Prove direct PostgreSQL, MySQL and SQLite against one
contract suite. No receipt evidence confirms settlement or triggers fulfillment.

## Evidence

Domain and provider slices are implemented with 186 synthetic/local tests. No new
storage support exists yet. Docker is available for isolated real database tests.
Kysely stable is 0.29.9; pg 8.23.1, mysql2 3.24.6, better-sqlite3 13.2.0 were
checked against official registry stable tags. ORM versions remain unselected.

## Steps

- [x] Define a minimal transaction/record contract and trusted verification workflow.
- [x] Prototype Kysely, validate host ownership and dialect transaction behavior.
- [x] Add migrations and direct driver entrypoints with optional peers.
- [x] Add real-engine shared race/rollback/idempotency/recovery/migration tests.
- [x] Verify installed exports/peers and migration documentation.
- [x] Run `pnpm verify`, review, update roadmap and commit.

## Validation

Use exact JSON scalar values with bounded records, stable ASCII keys and database
primary-key uniqueness. One shared store coordinates all tenant claims globally;
no conflicting tenant identity or receipt details may leak in outcomes. Serial
expectation locking and unique claim keys prevent order/receipt races. Related
claims, evidence, committed outcome and durable event must roll back together.
Replay after lost response returns the committed result; conflicting key reuse
returns an explicit conflict. Caller transactions are never committed/rolled back
by a transaction-scoped adapter, and host connections are never closed.

Test each real selected engine/client, including separate connections racing,
rollback fault injection, host transaction rollback, shared-store tenant isolation,
case/collation consistency, and fresh-process restart/replay. Migrations must be
idempotent and refuse incompatible versions. No advertising untested cells.

## Decisions

- Prototype a small typed transactional record store rather than duplicate every
  workflow query across SQL and ORMs. Record kinds use a versioned namespace and
  canonical SHA-256 keys, with one primary key enforcing uniqueness across engines.
  Document this storage schema as a local choice, not an ORM convention.
- Business orchestration lives in the core. The storage adapter supplies atomic
  transactions; it cannot accept a caller-supplied MATCH result as a claim guard.
- Prepare evidence outside transactions, then complete through an opaque in-process
  token. Durable workers will persist submissions and prepare again after restart.
- Prefer explicit serializable library-owned transactions and bounded retries.
  Caller-scoped transactions retain ownership and require whole-transaction retries
  on serialization/deadlock/uniqueness conflicts.
- Use isolated local Docker engine services with synthetic development credentials,
  loopback ports, health checks and pinned stable image tags. Never alter existing
  application databases or Docker resources.

## Handoff

Implemented the core workflow, v1 bounded transactional record store, three direct
driver entrypoints, caller transaction wrappers, migrations and shared suite.
45 real-engine cases pass on PostgreSQL 18.7/pg 8.23.1, MySQL 8.4.13/mysql2 3.24.6,
and SQLite 3.54.1/better-sqlite3 13.2.0, all through Kysely 0.29.9. This includes
synchronized child-process races, independent clients, rollback fault injection,
host commit/rollback, idempotency conflict, tenant isolation, cancellation/expiry,
provider output snapshots and fresh-process replay after commit/response loss.

Review removed a public boolean that could accidentally suppress transactions;
only explicit native caller wrappers and actual Kysely transactions are scoped.
Preparation on scoped adapters is refused. Migrations also test primary-key
uniqueness in a rolled-back probe; missing-constraint regressions pass on all
three engines. Core runtime dependencies remain empty. better-sqlite3 13.2.0 ships
its native prebuilds without install scripts; an unnecessary allowBuilds rule
was removed after inspecting the actual package manifest.

An installed-consumer check found require.resolve could see ambient system
modules outside the temporary install. Optional-driver isolation now checks the
actual installed node_modules tree and exercises a real SQLite workflow. `pnpm verify` passes on Node 26.13.1: 186 fast/provider tests, 45 real-engine
contract tests and 11 frozen reference cases, all formatting/lint/strict types,
Varlock schemas, three builds, publint and installed npm runtime/type consumers.
The SQLite consumer verifies claim/result/outbox replay and actual installed
optional-driver isolation. `vp env exec --node 24.22.3 pnpm verify` also passed with the same counts
and installed consumer checks. No ORM support is
advertised yet; packages remain private. The user confirmed original source
ownership; the existing ISC designation is retained. npm identity/scope are pending.
