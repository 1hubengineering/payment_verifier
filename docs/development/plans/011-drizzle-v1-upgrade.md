# Drizzle v1 RC upgrade

## Outcome and scope

Upgrade the Drizzle adapter and its private contract/installed consumers from
0.45.4 using drizzle-orm@rc and drizzle-kit@rc, following the user-selected
[upgrade prompt](https://orm.drizzle.team/agent-upgrade/v1/prompt.md).
Keep host-owned connections/transactions, the existing v1 receipt record schema,
receipt-only outcomes and the frozen reference unchanged. No host database
migration, reset, deployment or replacement registry release is part of this
upgrade. Existing session authorization covers verified 1hubengineering commits
and pushes after acceptance; the user additionally requires unchanged versions.

## Evidence

The worktree started clean at 687b403. Drizzle belongs to
packages/receipt-verifier-adapter-drizzle, with private validation in
tests/adapter-contract and scripts/check-package.mjs. ORM is a runtime peer with
a development installation; hosts own the actual ORM/driver client. Kit was not
installed. There is no Drizzle config, migration SQL, snapshot or journal in this
workspace: the direct SQL v1 migration owns the shared tables. No relations API
or relational queries are used. Published 0.1.0 remains a historical release.

On 18 November 2026, pnpm registry checks resolved both rc tags to 1.0.0-rc.5;
Kit requires drizzle-orm >=1.0.0-rc.5. The user's explicit RC request supersedes
the normal preference for stable dependency versions. Install through rc tags,
retain resolved versions in the lockfile and verify installed compatibility.

## Steps

- [x] Inspect ownership, existing workflow, tags and dialect upgrade instructions.
- [x] Upgrade ORM and Kit together, then follow the official agent setup prompt.
- [x] Load the updated bundled skill and verify available agent/CLI capabilities.
- [x] Adapt public adapter types/queries and installed consumers for v1 changes.
- [x] Account for migration history and run applicable local Kit up/check commands.
- [x] Validate types/builds and isolated synthetic integrations; review failure paths.
- [x] Reconcile compatibility, roadmap and unreleased change documentation.

## Validation

Read every command before executing it. Do not run Drizzle migrate/push/pull --init
or host migration/deployment commands. There is no existing application database
or Drizzle history to convert. Use only disposable synthetic fixtures for library
contract acceptance, never an unknown or existing host database. The normal full
pnpm verify provisions schema and resets records in its dedicated receipt_test
fixture services; this is test setup, not a host/database-history upgrade.
Preserve the frozen reference and demonstrate actual host transaction commit/
rollback, races, idempotency, recovery and installed exports on each selected
engine. Record Kit/local-history applicability and actual skill/MCP activation.

## Decisions and handoff

Runtime ORM remains an explicit host peer; its v1 RC-series peer range does not
pin an RC number. Development ORM/Kit selectors use rc, while the lockfile records
1.0.0-rc.5. Installed consumers install that resolved workspace version, preventing
a moving tag from silently changing the version under validation. Stable v1 and
other RC revisions are not advertised as tested.

The first type check reproduced removed legacy transaction/builder exports,
changed relation generics and rejected positional client constructors. Adapt to
PgAsyncTransaction/MySqlAsyncTransaction/SQLiteAsyncTransaction, new builder types,
AnyRelations and drizzle({ client }) without casts or query/schema changes.
All 81 Drizzle cases passed on PostgreSQL, MySQL and local SQLite. Cold installed
consumers pass runtime imports, plain-client rejection and strict API types for
both empty and defineRelations-configured clients. One npm consumer install hit
ETIMEDOUT; a fresh retry passed with the same package/test contents.

Kit local up/check/export passed for PostgreSQL, MySQL, SQLite and Turso. Empty
scratch histories report upgraded=[]; the PostgreSQL schema_changed warning is
expected because the direct SQL migration is the owner. SQL export checks assert
both existing table names, keys, types and required payload/version columns.
No existing history was replaced, SQL applied or host database inspected.

Kit installed its bundled revision-15 drizzle skill in the adapter package.
The eight instruction/topic files match the bundled originals and relative links
resolve; a root discovery symlink exposes the same skill. The upstream repository
license is retained alongside the copied guides. The installed skills-version
check matched revision 15. No custom Drizzle skills existed to overwrite.

Project .codex/config.toml uses pnpm exec drizzle-kit mcp with the adapter's
absolute working directory. codex mcp get drizzle reads the correct entry. A live
stdio initialize/tools-list handshake returned generate/fix_conflicts/push/check/
export/up/pull; it invoked none of those database/file operations and the temporary
server was stopped. The current session has no mcp__drizzle tools: reload Codex,
then inspect /mcp to activate this saved entry.
The skill with local CLI is usable now; do not claim current-client activation.

The user requires no package-version increment. All five library versions remain
0.1.0. Existing npm versions cannot be overwritten, even after unpublishing; no
new registry write or release-asset replacement is attempted. The registry checker
now obtains the Drizzle peer from the actual published metadata, so historical
0.1.0 verification continues to use its real 0.45.4 peer independently of the
upgraded workspace. Source publication and npm publication remain distinct.

The normal pnpm verify runs against a newly created Compose project named
receipt-drizzle-v1-upgrade, its disposable tmpfs receipt_test databases, and local
temporary SQLite files. Existing Compose services were absent before provisioning.
Only this new project is stopped afterward. Full pnpm verify passed on Node
26.13.1: 237 fast/application/provider cases, all 243 real-engine cases (including
81 on the upgraded Drizzle paths), 11 frozen reference cases, four local Kit
up/check/export checks, builds/lint/strict types/publint and isolated installed
consumers. The original registry 0.1.0 release check also passed with its peer
resolved from published metadata. No version field changed.

Review against code-review.md found no query/schema/settlement change: only the
v1 type/class and constructor surfaces changed. Actual caller commit/rollback,
tenant/idempotency isolation, races, crash recovery and client ownership passed
on all three Drizzle cells. Fixture setup uses fresh owned services; no host
migration or deployment was run. Frozen source files remain unchanged.
Source commits/pushes use verified 1hubengineering identity; hosted two-runtime
checks follow the source commit. Current-client MCP activation still requires a
reload; the installed skill with CLI and the direct server handshake are verified.

Sources: [upgrade prompt](https://orm.drizzle.team/agent-upgrade/v1/prompt.md),
[agent setup](https://orm.drizzle.team/agent-setup/prompt.md), dialect upgrade and
breaking-change guides, [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp),
and [npm immutable versions](https://docs.npmjs.com/policies/unpublish/).
