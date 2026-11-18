# Drizzle and versioned Prisma

## Outcome and scope

Prove every advertised ORM/engine cell through the same atomic storage workflow,
including caller-owned transactions. Keep adapters optional and core dependencies
empty. Deliver Drizzle and Prisma as separate complete implementation commits.

## Evidence

Direct SQL passed 45 shared contract cases and installed consumer checks on Node
24.22.3 and 26.13.1. The v1 record schema, canonical keys and business workflow are
shared; ORM operations must use the actual configured ORM client/transaction.
Official registry checks on 18 November 2026 identify Drizzle 0.45.4 as stable;
1.0 tags remain prereleases. Prisma Client 7.10.1 is stable; CLI latest points to
8.0.0-rc.34, so select explicit matching stable Prisma CLI/client 7.10.1.

## Steps

- [x] Share bounded record serialization/validation with custom adapters.
- [x] Implement native Drizzle PostgreSQL/MySQL/SQLite client and transaction paths.
- [x] Run the unchanged contract suite on all three real Drizzle engine cells.
- [x] Document migration ownership, installed peers, limitations; verify and commit.
- [ ] Generate and test explicit Prisma 7.10.1 clients for all three engines.
- [ ] Implement Prisma delegate and caller-transaction paths; run the same suite.
- [ ] Verify installed artifacts/types, document compatibility, review and commit.

## Validation

Do not implement ORM adapters by opening an unrelated direct-SQL connection.
Every read, claim, outcome and event must use the actual selected ORM transaction.
Run the shared suite, including host rollback/commit and synchronized independent
process races. Generated ORM models/schema definitions must match the selected
migration owner. Installed ESM/types must work without workspace aliases. A cell
is supported only after its real engine and exact client pass.

## Decisions

- Stable versions are explicit even when a registry's latest tag is a prerelease.
  No blanket compatibility promise for Prisma 8, Drizzle 1.0 or other clients.
- Use asynchronous local-file libSQL for Drizzle SQLite. better-sqlite3's synchronous
  Drizzle transaction callback cannot safely await this asynchronous core workflow.
  This is a separately versioned SQLite integration, not a claim about all drivers.
- Use Prisma 7's selected official pg/MariaDB/better-sqlite3 driver adapters only
  in the test/host boundary. The library receives the generated host client.
- One migration owner manages the shared v1 record tables. Ship ORM table/model
  definitions and document how hosts incorporate those definitions; do not create
  separate shadow stores or let two migration systems independently own tables.
- Sources: https://orm.drizzle.team/docs/transactions,
  https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/mysql,
  official npm registry stable metadata and installed versioned declarations.

## Handoff

Drizzle native PostgreSQL and MySQL paths passed the shared contract suite.
Initial SQLite testing with registry-latest @libsql/client 0.18.0 failed three
concurrency/process cases. A minimal native reproduction showed a failed BEGIN
left subsequent transactions failing SQLITE_BUSY (cannot commit transaction —
SQL statements in progress). The adapter does not reconnect/close caller-owned
clients to hide this failure. Explicit stable @libsql/client 0.17.4 passes all
15 cases, including independent clients and synchronized child processes. The
selected SQLite engine reports 3.45.1. All six direct/Drizzle cells now pass 90
shared cases. Actual Drizzle transaction objects are runtime-checked before scope
binding, and the shared bounded record codec remains dependency-free.

Installed isolated PostgreSQL-only, MySQL-only and SQLite-only Drizzle consumers
pass runtime export/table-object checks and strict API/negative transaction typing.
They follow the workspace's skipLibCheck policy because Drizzle's upstream 0.45.4
declarations fail full TypeScript 7 vendor checks. Core/SQL consumers still pass
full declaration checking. This limitation is documented rather than suppressed
in core checks. Full acceptance and Node 24 validation remain before commit. Prisma implementation is next. npm identity/scope remain unverified.

## Drizzle acceptance

`pnpm verify` passed on Node 26.13.1, and
`vp env exec --node 24.22.3 pnpm verify` passed on Node 24.22.3. Each run passed
186 fast/provider tests, 90 real-engine contract cases, all 11 frozen reference
tests, schema/config checks, formatting/lint/strict package types, four builds,
publint and isolated core/SQL/CBE/Drizzle npm consumers. Drizzle consumers were
separate PostgreSQL-only, MySQL-only and SQLite-only installations of the same
adapter tarball with their selected peers. Core runtime dependencies remain empty.
The direct SQL commit's hosted CI also passed before this change.

Review against code-review.md confirmed no driver ownership changes, ORM query
execution through actual scoped transactions, no receipt-to-settlement transition,
and fail-closed behavior for the known unsupported libSQL 0.18.0 path. Prisma
remains the next incomplete part of this plan.
