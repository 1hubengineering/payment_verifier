# Workspace conventions — 18 November 2026

These decisions apply to active development. The original library research and
initialization audit remain dated records. A folder pattern is a local design
choice; official tooling documentation verifies the commands and constraints.

## Tooling and runtime policy

| Component               | Decision                                                             | Evidence                                                                                                                                                                                         |
| ----------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Development Node        | 26.13.1 LTS, pinned in `.node-version`                               | [Node release index](https://nodejs.org/dist/index.json) lists it as the latest stable 26 release; [release policy](https://nodejs.org/en/about/previous-releases) recommends LTS for production |
| Library runtime support | `^24.22.3 \|\| ^26.13.1`; test both minimum versions                 | Both are current LTS patch releases. Supporting these two majors is a project choice, not an automatic Vite+ requirement                                                                         |
| Node types              | 24.19.2                                                              | Latest stable patch in the 24 major from the registry. Use the oldest supported runtime's type major to avoid unintentionally depending on newer APIs                                            |
| pnpm                    | 12.21.0                                                              | Stable registry tag; pin once in `packageManager`, without duplicate package-manager metadata                                                                                                    |
| Vite+                   | 1.7.0                                                                | Stable registry tag; continue using `vp check`, `vp test run`, and [`vp pack`](https://www.viteplus.dev/guide/pack)                                                                              |
| TypeScript              | 7.0.2                                                                | Stable registry tag. Compiler package stability does not imply that every compiler integration API is stable                                                                                     |
| Declaration generator   | `oxc`, with explicit public types and package `isolatedDeclarations` | [tsdown generator reference](https://tsdown.dev/reference/api/Interface.DtsOptions#generator) documents Oxc's isolation requirement and identifies `tsgo` as using an experimental API           |
| Varlock / publint       | 1.25.0 / 0.3.25                                                      | Existing pins match their stable registry tags                                                                                                                                                   |

Stable tag checks used `npm view <package> dist-tags --json`; package metadata came
from the official npm registry. These observations apply on the date above.
Do not select a beta, RC, alpha, `next`, or experimental generator merely because
its version is newer. Recheck sources and the lockfile when changing versions.

The compiler still checks the full code separately from Oxc's declaration emit.
The packed consumer checks emitted declarations as well as runtime exports.
Node [type stripping](https://nodejs.org/api/typescript.html) is stable and enabled
by default on supported versions, so the root reference-test command uses
`node --test` without an experimental flag. Frozen historical test source retains
its original child-process arguments to preserve the regression baseline.

## Names and package boundaries

| Location                                                  | npm name / role                                                                        |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `packages/receipt-verifier`                               | `@1hubengineering/receipt-verifier`: public library API and provider-neutral domain    |
| `apps/cli`                                                | `@1hubengineering/receipt-verifier-cli`: private trusted operator application boundary |
| `tests/reference-cli`                                     | Frozen synthetic source and regression evidence; never a runtime dependency            |
| `scripts`                                                 | Workspace verification utilities                                                       |
| `examples/<framework>-<scenario>`                         | Consumer applications when implemented, such as `fastify-checkout`                     |
| `docs/library-plan` / `docs/development` / `docs/archive` | Original direction / current workflow and execution plans / historical requirements    |

Use lowercase, descriptive, hyphenated npm names, as recommended by
[npm package metadata guidance](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#name).
The npm scope is now `@1hubengineering`. CLI authentication and the registry profile
separately confirm that user identity and verified email. npm assigns the matching
personal namespace to the user; no organization is needed. The user selected this
scope after finding the provisional `@andhub` name unavailable. All packages remain
private until release gates pass; no registry publication or name reservation is
claimed before publishing succeeds.

Implemented optional integrations use a consistent product prefix:

| Folder                                      | npm name                                            | Reason to split                                     |
| ------------------------------------------- | --------------------------------------------------- | --------------------------------------------------- |
| `packages/receipt-verifier-storage-sql`     | `@1hubengineering/receipt-verifier-storage-sql`     | SQL drivers, migrations, and connection integration |
| `packages/receipt-verifier-adapter-drizzle` | `@1hubengineering/receipt-verifier-adapter-drizzle` | Drizzle peer/version and transaction contract       |
| `packages/receipt-verifier-adapter-prisma`  | `@1hubengineering/receipt-verifier-adapter-prisma`  | Versioned Prisma client and transaction contract    |
| `packages/receipt-verifier-provider-cbe`    | `@1hubengineering/receipt-verifier-provider-cbe`    | Optional browser execution dependencies             |

Each of these packages now has actual implementation and installed-consumer checks. Telebirr retrieval and shared extraction use the dependency-free core `/providers`
subpath; CBE browser execution is now implemented in its optional package.
Small providers may remain core
subpath exports when their dependencies and release needs do not justify a new
package. The private worker lives in `apps/worker`, outside published provider packages.
Use actual workspace dependencies with `workspace:*` when implementation needs
them. Never put host frameworks, environment loaders, ORM clients, database
drivers, or Chromium dependencies into the provider-neutral core.

## Command convention

Prefer simplicity and concise wording. Use `pnpm <script>` in docs and CI,
including `pnpm verify`. Add `run` only when a script name conflicts with a built-in
command, as described by [pnpm](https://pnpm.io/cli/run).
Installation remains `pnpm install --frozen-lockfile`.
Use `pnpm exec <binary>` for direct one-off local tools.

Scripts group checks under `check:*`: `check:fix`, `check:env`, and `check:package`.
`typecheck`, `test`, `test:watch`, `test:reference`, `build`, and `verify` describe
their actual behavior. This grouping is a local convention.

Inside scripts, use [Vite+ tasks](https://www.viteplus.dev/guide/run) for workspace
selection and ordering. Explicit package globs with `--fail-if-no-match` prevent
renames from silently skipping builds. Keep task-runner options before the task
name; arguments following a task are forwarded to its command.

`vp pack` builds JavaScript/declarations; `pnpm pack` produces an installable
archive. They serve different steps in the installed-package verification.

## CI maintenance

The workflow uses stable [checkout v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1)
and [setup-vp v1.22.0](https://github.com/voidzero-dev/setup-vp/releases/tag/v1.22.0),
with exact official release commit SHAs and readable version comments. The Vite+
setup action follows its [official CI guidance](https://www.viteplus.dev/guide/ci).
CI retains read-only repository permissions, explicit runtime versions, frozen
installation, and the same acceptance command as local development.

Update action SHAs from verified official release tags when maintaining the
workflow. Local checks and hosted CI validate the package; the direct/Drizzle main commit
passed both configured Node versions. Each new slice must pass its own CI.
Current automation is exercised on Linux; no macOS or Windows validation is claimed.

## Provider execution and verification

Playwright is pinned to stable 1.65.1 in the CBE package, with its matching Chromium
installed by `pnpm setup:browsers`; CI uses Playwright's documented `--with-deps`
installation. The core has no browser dependency. Provider transport currently
supports public IPv4 only and refuses redirects and compressed bodies. CBE browser
network is disabled; inline rendering is supported, external assets are blocked.
These boundaries are locally tested, with no live provider compatibility claim.

`pnpm verify` now builds before checking/testing so a clean checkout resolves
workspace package exports and declarations. Explicit build filters preserve Vite+
dependency ordering (confirmed by task-plan JSON); recursive and filter flags
cannot be combined. Packed checks first install the core alone offline, then
install the CBE tarball with its exact Playwright peer from npm. No workspace
aliases or symlinks are used by the installed consumer.

## Direct storage compatibility

The direct adapter uses Kysely 0.29.9 with optional exact driver peers pg 8.23.1,
mysql2 3.24.6 and better-sqlite3 13.2.0. Real-engine shared tests use PostgreSQL
18.7, MySQL 8.4.13 and bundled SQLite 3.54.1, selected from stable releases and
verified engine output. No ORM versions or other engine/client combinations are
implied. PostgreSQL 19 remained a release candidate and was not selected.
Sources: [PostgreSQL release](https://www.postgresql.org/about/news/postgresql-187-1712-1616-1520-1425-and-19-rc-2-released-3442/),
[MySQL 8.4 release notes](https://dev.mysql.com/doc/relnotes/mysql/8.4/en/), official
npm registry stable tags, and installed driver manifests.

`pnpm db:up` starts the isolated synthetic test Compose project; `pnpm db:down`
stops it. Data is disposable tmpfs, ports bind loopback, and no existing Docker
application resources are touched. Integration configuration lives in the private
`tests/adapter-contract` package with its own Varlock schema and generated local
types. Its runner refuses non-loopback databases or any database name other than
`receipt_test`. `pnpm verify` runs both fast/provider tests and the real-engine
contract suite. CI starts the same pinned services and stops them on completion.

Storage uses one versioned typed record schema, not separate ORM-owned shadow
stores. A single migration owner maintains its primary keys and version metadata.
Hosts retain all connection, transaction, settlement and fulfillment ownership.

## ORM compatibility

Drizzle 0.45.4 is now tested with pg 8.23.1/PostgreSQL 18.7, mysql2
3.24.6/MySQL 8.4.13 and @libsql/client 0.17.4/local SQLite 3.45.1. libSQL 0.18.0
is excluded after reproducible concurrency failures; the exact optional peer
constraint records that measured boundary. The synchronous better-sqlite3 Drizzle
transaction callback is not advertised for this asynchronous workflow.

The core `/storage` subpath supplies bounded JSON codecs, key/scan validation and
the custom transaction contract without driver dependencies. ORM adapters reuse
that schema protocol. Drizzle consumers follow the existing skipLibCheck policy
because its upstream declarations fail full TypeScript 7 vendor checking. Strict
API usage and negative transaction typing still pass in isolated installations;
core and direct-SQL declarations pass full checking.

Registry latest for Prisma CLI pointed to 8.0.0-rc.34 while Prisma Client latest was
stable 7.10.1. The integration selects matching stable CLI/client and official driver adapters
7.10.1. All three cells pass the shared contract suite on Node 26: pg 8.23.1 /
PostgreSQL 18.7, mariadb 3.5.4 / MySQL 8.4.13, better-sqlite3 12.11.1 /
SQLite 3.53.2. Generated clients match distributed model snippets. Actual
Serializable caller transactions and installed declarations are tested. Prisma
8 and other combinations remain unsupported. Hosted CI passed on both Node 24 and 26 for commit 342dbb5, building the native
dependency for each runtime. The subsequent parser review commit also passed
both hosted runtime gates.

## Operator applications

`pnpm cli` and `pnpm worker` run private TypeScript entry points through each
application's Varlock startup schema. Their selected store is local SQLite WAL
with better-sqlite3 13.2.0; the SDK's wider nine-cell matrix is independent. Both
apps share the workspace SQLite default, explicit queue key and timeout-derived
lease policy. Traffic defaults disabled, and CBE requires a second opt-in. CLI
saved-HTML diagnosis opens no database and cannot claim. The worker emits safe
outcome classes and handles SIGINT/SIGTERM with abort and owned-handle cleanup.

## Embedded example

The private `examples/fastify-checkout` package pins stable Fastify 5.12.8
(registry next 6.0.0-alpha.6 is excluded). Its factory receives host-owned auth,
orders, admission and independent settlement/fulfillment state. Additional body
fields are rejected by explicit AJV configuration. The loopback-only Varlock
demo selects SQLite directly and has no providers. `pnpm checkout` starts it;
its public synthetic session token is documented solely for local demonstration.
Official [testing](https://fastify.dev/docs/latest/Guides/Testing/) and
[validation](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)
documentation informed the injection tests and strict schema configuration.

## SQLite native ownership

Use one native SQLite implementation per process for any one database file.
The direct driver, Prisma's selected 12.x driver and libSQL embed different copies
of SQLite; overlapping handles to one file in one process violate SQLite's
[documented POSIX locking boundary](https://www.sqlite.org/howtocorrupt.html#multiple_copies_of_sqlite_linked_into_the_same_application).
The ORM harness detaches its initial direct handle and runs SQL migration/reset
maintenance in separate short-lived processes. ORM race/replay/crash children open
only their selected client, not a parallel direct-SQL handle. Public connection
ownership is unchanged; hosts using a different migration driver should likewise
run that migration owner as a separate process. Local files only are tested.

Chromium OS sandboxing is mandatory for CBE. Ubuntu hosted runners with AppArmor
user-namespace restrictions load a temporary executable-scoped permission profile
for the pinned Playwright browser binaries, then remove it during cleanup. The
global namespace restriction stays enabled; renderer seccomp and PID namespace
assertions still run. Production hosts must supply appropriate unprivileged
sandbox/worker confinement; the SDK has no unsafe sandbox bypass.
