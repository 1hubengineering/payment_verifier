# Library roadmap

`docs/library-plan/init-plan.md` is the starting direction. This document tracks
implementation; a target is not a supported integration until its gate passes.

| Slice                                         | State                                        | Acceptance gate                                                                                                                                                                      |
| --------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0. Audit and development foundation           | Complete; verified locally on Node 24 and 26 | Pinned workspace, offline baseline, Codex instructions, CI definition, and packed consumer                                                                                           |
| 1. Provider-neutral domain and compare engine | Implemented; local gate passed               | Trusted immutable expectations; exact minor units; explicit field checks; missing/ambiguous evidence fails closed; separate settlement states                                        |
| 2. Provider extraction and retrieval          | Implemented; synthetic/local gate passed     | Port Telebirr v5 synthetic regression behavior; provider-neutral errors and provenance; bounded allowlisted HTTP; separately packaged CBE browser execution with local failure tests |
| 3. Storage contract and direct SQL            | Implemented; direct matrix gate passed       | Prototype Kysely; shared real PostgreSQL/MySQL/SQLite tests; atomic claims/evidence/results/outbox; idempotency and rollback; caller-owned connections                               |
| 4. Drizzle and versioned Prisma               | Next                                         | Explicit client/engine versions; all advertised engine cells pass the shared contract suite and caller transaction tests                                                             |
| 5. CLI and optional durable worker            | Planned                                      | Varlock at startup; durable acceptance, leases/retries, bounds, restart and crash recovery; no lost acknowledged work                                                                |
| 6. Fastify checkout example                   | Planned                                      | Host auth/order ownership; trusted expectation snapshot; structured outcomes; no fulfillment from receipt alone                                                                      |
| 7. Release readiness                          | Planned                                      | All three engines and advertised ORM paths proven, migration docs, packaging, provenance/licensing, release policy                                                                   |

PostgreSQL, MySQL, and SQLite remain first-release requirements. Delivery can be
incremental. Direct PostgreSQL 18.7/pg 8.23.1, MySQL 8.4.13/mysql2 3.24.6, and
SQLite 3.54.1/better-sqlite3 13.2.0 now pass the same 15-case contract suite
through Kysely 0.29.9. ORM paths remain unimplemented. The frozen SQLite test
continues to prove only the old CLI behavior. Prisma versions must be selected
and verified when the adapter is implemented; assertions in the initial research
about future major versions are not adopted as a compatibility guarantee.

Create `packages/receipt-verifier-storage-sql`, `packages/receipt-verifier-adapter-drizzle`,
`packages/receipt-verifier-adapter-prisma`, `packages/receipt-verifier-provider-cbe`, `apps/worker`,
`examples/fastify-checkout`, and `tests/adapter-contract` as their slices begin.
Do not publish empty packages or install every optional driver into the core.

Slice 1 is implemented in `packages/receipt-verifier/src/comparison.ts`; its
[execution plan](plans/002-domain-comparison.md) records the contract and evidence.
The core now validates frozen host expectation snapshots, compares exact integer
ETB evidence with explicit inclusive time bounds, and reports field checks.
Missing, malformed and ambiguous required evidence remains unable to verify.
All comparison results retain settlement `UNCONFIRMED`. Provider extraction and bounded retrieval are implemented in the provider
subpath and optional CBE package; atomic storage claims are implemented through
the configured verifier and direct SQL adapters. The API remains private and provisional.

Slice 2's [execution plan](plans/003-provider-evidence.md) records synthetic
Telebirr/CBE parsing, bounded IPv4/TLS retrieval, explicit provenance and real
Chromium failure tests against mocked provider HTML. No live provider validation
is claimed. CBE blocks all external assets and permits only inline rendering;
unsupported layouts remain unavailable. Root imports still have no dependencies
or provider I/O. Chromium installation is required only for the optional package
and workspace browser tests. `pnpm setup:browsers` installs its matching browser.

Slice 3's [execution plan](plans/004-storage-contract.md) records atomic claims,
normalized evidence, idempotent results and durable events, with caller-owned
transaction commit/rollback, rollback fault injection, synchronized process races
and fresh-process replay on all three engines. The core retrieves before locks
and rejects preparation on caller-scoped adapters. Migrations are explicit,
repeatable and reject incompatible versions or missing uniqueness constraints.
Installed SQLite-only consumers need neither pg nor mysql2. Shared-store claims
coordinate every tenant; independent stores do not coordinate receipt reuse.

Execution access findings (18 November 2026): GitHub CLI and connector confirm
`1hubengineering`. After the user refreshed token permissions, `GET /user/emails`
confirmed its primary `andhubengineering@gmail.com` address is verified. Commits
use that account's identity in repository-local Git configuration. `npm whoami`
returns ENEEDAUTH; scope access is unverified. The user confirmed original code ownership; the existing ISC designation is retained
in root/package license files and the provenance record. These are separate release gates;
no package or release is published.

Current naming and runtime decisions are recorded in [workspace conventions](conventions.md).
The original initialization plan contains historical package-path examples.
