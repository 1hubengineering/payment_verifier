# Workspace audit — 18 November 2026

This is the initialization snapshot. Current paths, runtime pins, and commands
are maintained in [workspace conventions](conventions.md); the later
[modernization plan](plans/001-modernize-workspace-conventions.md) records the
follow-up changes and validation.

## Current implementation and release review

The published baseline slices 0–7 are complete. Release source c4464f0 passed pnpm verify locally and
on hosted Node 24.22.3/26.13.1: 237 fast/application/example/provider cases,
243 real-engine contract cases across nine cells, all 11 frozen cases, builds,
types/lint/publint and installed consumers. The SQLite ORM harness separates
native implementations per file and process; three repeated 52-case runs followed
that correction. The [compatibility matrix](compatibility.md) gives exact versions.

[Plan 010](plans/010-release-readiness.md) records active/ended SQLite scope checks,
mandatory browser sandbox/environment isolation, bounded stored evidence, source/
license/identity review and clean rebuilt artifacts. All ten frozen originals
still match byte-for-byte; production audit reported zero advisories. The five
0.1.0 npm libraries and [GitHub release](https://github.com/1hubengineering/payment_verifier/releases/tag/v0.1.0)
are public as 1hubengineering. Registry publisher/maintainer, SHA-256/SHA-512 and
a fresh installed receipt/idempotency/durable-job consumer passed. The tag points
to c4464f0 and all seven public release downloads match reviewed files. Root/apps/
examples/tests remain private npm packages. No release blocker remains; see the
[roadmap](roadmap.md) and [release evidence](releases/0.1.0.md).
Earlier audit sections below remain the initialization record rather than current
claims about missing implementation.

The post-release [Drizzle v1 RC source upgrade](plans/011-drizzle-v1-upgrade.md)
selects ORM/Kit rc tags, currently locked to 1.0.0-rc.5. Adapted asynchronous
transaction classes, builder types, AnyRelations and explicit client construction
pass all 81 real Drizzle cases and installed-consumer API checks. Full local
pnpm verify also passed 237 fast/app/provider, 243 real-engine and 11 frozen
cases plus four local Kit up/check/export checks, builds/types/lint/publint. Local Kit
up/check/export validation uses scratch directories only; no application migration
history or host database was changed. Package versions stay 0.1.0 as requested;
the published archives still contain Drizzle 0.45.4. The roadmap records full
workspace acceptance and source publication separately.

## Initial state

The workspace contained a placeholder ESM `package.json`, two library planning
documents, two standalone planning/handoff documents, and
`reference/unified-payment-cli.zip`. There was no `.git` directory, lockfile,
source workspace, build, CI, agent guidance, or working root test command.
The root manifest already selected pnpm 12.21.0 and ISC.

The IDE listed additional library-plan tabs, but only `init-plan.md` and
`library-plan.md` existed on disk. No missing-tab content was assumed.
The existing planning documents were preserved.

## Reproduced evidence

The archive's source, tests, synthetic fixtures, and package manifest were
inspected in an isolated temporary directory. Archived dependencies, historical
diagnostic code, and live order files were excluded from execution.

Command: `node --experimental-strip-types --test tests/verify.test.ts`, run in the
extracted reference. Result: **11 passed, 0 failed**, on Node 26.13.1 and again on
Node 24.22.1. The suite includes CBE and Telebirr parsing, Telebirr v5 table
extraction, missing/mismatched fields, locator rejection, SQLite persistence and
uniqueness, and two independent processes racing for one receipt.

The same ten reviewed files now live unchanged in `tests/reference-cli`, where
`pnpm test:reference` reproduces the suite without the ZIP or Playwright.
Archive SHA-256 is recorded in that directory's README.

This evidence is offline and synthetic. No live provider flow, provider latency,
settlement, durable worker, or new library database adapter was proven. Historical
live results in the master plan remain user-reported evidence with their original
limits; the CBE diagnostic success is not a production CLI success claim.

## Findings, ranked for library migration

| Priority          | Finding and evidence                                                                                                                                                                                                       | Consequence / required action                                                                                                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical boundary | The old API returns `MATCH`; there is no independent settlement integration.                                                                                                                                               | Preserve receipt-only semantics explicitly. Never credit or fulfill from that outcome. New status types separate verification and settlement.                                               |
| High              | `src/core.ts` exports `claim()` separately; it checks for a transaction ID but does not run `compare()`.                                                                                                                   | Do not expose this API in the library. The future atomic storage path must enforce trusted matching and current expectation state before claims/evidence/events commit.                     |
| High              | Order amount validation uses `Math.round(amount * 100) !== amount * 100`. Reproduction with the valid synthetic order and `amount: 0.29` throws. Comparison also rounds floating-point amounts.                            | Parse canonical decimal text to bounded integer minor units. The initialized core provides this primitive and boundary tests; the frozen legacy source remains unchanged.                   |
| High              | Official HTTPS host/path checks, Telebirr redirect refusal, a 15-second deadline, content-type checks, and a streamed 2 MB cap exist. DNS/IP destination enforcement is absent; CBE checks the final URL after navigation. | Enforce destination policy and browser request/redirect boundaries before enabling provider retrieval in the new library. Exact URL validation alone is insufficient for that release gate. |
| High              | CBE launches a browser per retrieval. There is no queue admission, concurrency pool, public auth, or rate limiting.                                                                                                        | Keep Chromium optional and isolated. Bound work and use host auth plus explicit execution limits before exposing requests. No claim is made that resource exhaustion is controlled.         |
| High              | SQLite claims are persistent and transactional, but jobs, attempts, outcomes, and outbox delivery are not a durable atomic workflow.                                                                                       | Define idempotency and transaction-scoped storage; test rollback, post-commit reply loss, leases and restart recovery on real engines.                                                      |
| Medium            | Core, retrieval, file access, and SQLite live together in the old `core.ts`.                                                                                                                                               | The new core has no runtime dependencies. Add providers and adapters separately as implemented, with host-owned connections.                                                                |
| Medium            | Only local SQLite claim behavior exists. No PostgreSQL, MySQL, Drizzle, or Prisma adapters/tests exist.                                                                                                                    | Keep all intended first-release engines in the roadmap. Advertise only versioned combinations that pass a shared engine-backed suite.                                                       |
| Medium            | The original archive contains node_modules and live/historical order files. Source provenance/public licensing is unresolved.                                                                                              | Ignore the ZIP in Git, preserve only synthetic regression material, and resolve provenance before public distribution.                                                                      |

## Architecture decision

Follow the embedded library direction in `init-plan.md` and `library-plan.md`.
Use the host's authentication, order snapshot, database, and fulfillment logic.
Retain the proven synthetic Telebirr extraction behavior when porting providers.
Keep CBE execution separate because of browser/runtime needs.

An authorized structured provider/merchant API could improve evidence quality,
but none has been established in this workspace. No unsupported endpoints or
access assumptions were introduced. A hosted API remains a future wrapper around
the library. Matching, claiming, settlement, and fulfillment retain separate meanings.

Kysely is the planned direct-SQL prototype, not yet a committed dependency.
Drizzle and Prisma require their own transaction-aware integrations. Claims
coordinate only consumers sharing the same claim store; independent installations
do not automatically coordinate receipt reuse.

## Tooling evidence and source notes

The installed global Vite+ CLI was 1.6.0. Registry inspection reported Vite+ 1.7.0,
TypeScript 7.0.2, publint 0.3.25, and Varlock 1.25.0. The workspace pins these
resolved versions and Node 24.22.1, while retaining pnpm 12.21.0. These are
observations on the audit date, not promises about future latest versions.

An official `vp create vite:monorepo` scaffold was generated in a temporary
directory and its generated library configuration inspected. The workspace
adapts its workspace/library patterns while omitting the sample website and
placeholder publishing identities. No starter was run over existing documents.

- [Vite+ creation](https://www.viteplus.dev/guide/create) documents the official monorepo/library templates.
- [Vite+ monorepo configuration](https://www.viteplus.dev/guide/monorepo) defines root lint/format settings.
- [Vite+ library packing](https://www.viteplus.dev/guide/pack) documents `vp pack`.
- [Vite+ CI](https://www.viteplus.dev/guide/ci) documents its setup action.
- [Varlock monorepos](https://varlock.dev/guides/monorepos/) documents application-local schemas and types.
- [Codex instructions](https://learn.chatgpt.com/docs/agent-configuration/agents-md) supports checked-in repository guidance.

Current validation results and remaining work are recorded in
`plans/000-initialize-library-workflow.md` and `roadmap.md`.
