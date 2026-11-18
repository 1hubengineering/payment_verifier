# Ethiopian receipt verification library

A TypeScript workspace for embedding receipt verification into an existing backend.
Core comparison, bounded providers, nine real SQL/ORM integrations, durable jobs,
operator apps and the checkout example are implemented and tested. Receipt results
always retain settlement UNCONFIRMED. All five 0.1.0 libraries passed final local
and hosted Node 24/26 checks. Source is public; the reviewed npm implementations
remain staged. The user reports approval, but registry publication is unconfirmed.
Public 0.0.0-stage placeholders contain
no SDK implementation. The GitHub release is a draft. Root, operator apps, example
and tests stay private. See [release evidence](docs/development/releases/0.1.0.md).

## Develop

Install the [Vite+ CLI](https://www.viteplus.dev/guide/), then:

```sh
vp env install
pnpm install --frozen-lockfile
pnpm setup:browsers
pnpm db:up
pnpm verify
pnpm db:down
```

`pnpm setup:browsers` installs Chromium for the optional CBE integration tests.

Node **26.13.1 LTS**, pnpm **12.21.0**, Vite+ **1.7.0**, and TypeScript **7.0.2**
are pinned. CI also validates Node **24.22.3 LTS**. The existing ISC designation is retained after the user confirmed source ownership;
see [provenance](docs/development/provenance.md).

| Location                                                                                 | Current responsibility                                                                                 |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `packages/receipt-verifier`                                                              | Exact ETB parsing, immutable expectation snapshots, pure receipt comparison; ESM and declarations      |
| `packages/receipt-verifier-storage-sql`                                                  | Direct SQL with explicit migrations and caller-owned connections                                       |
| `packages/receipt-verifier-adapter-drizzle` / `packages/receipt-verifier-adapter-prisma` | Versioned real-engine ORM integrations                                                                 |
| `apps/cli`                                                                               | Trusted operator commands with app-local Varlock validation                                            |
| `apps/worker`                                                                            | Optional bounded SQLite worker with durable recovery                                                   |
| `examples/fastify-checkout`                                                              | Private embedded host-auth/order example; loopback demo has no providers                               |
| `tests/reference-cli`                                                                    | Frozen 11-test offline reference, including a cross-process SQLite race                                |
| `scripts/check-package.mjs`                                                              | Pack the library, install with npm in a temporary consumer, validate JavaScript and TypeScript exports |
| `docs/development`                                                                       | Audit, roadmap, workflow, review criteria, and execution plans                                         |

`pnpm verify` validates application configuration, generates Prisma test clients,
builds the libraries, checks formatting/lint/types, runs fast/provider and real-engine
contract tests, preserves the original synthetic baseline, and checks publint plus
isolated installed packages. No bank requests are required. Chromium uses mocked provider HTML; direct storage
tests require the isolated PostgreSQL/MySQL Compose services plus local SQLite.

Use the [documentation index](docs/README.md) to find active and archived material.
The [workspace conventions](docs/development/conventions.md) explain package naming,
boundaries, supported runtimes, and the sources checked for tooling decisions.
Start with [init-plan.md](docs/library-plan/init-plan.md), then the
[audit](docs/development/workspace-audit.md), [workflow](docs/development/workflow.md),
and [roadmap](docs/development/roadmap.md). Codex reads repository conventions from
[AGENTS.md](AGENTS.md).

Operator commands: `pnpm cli help` and `pnpm worker --help`. See the
[CLI](apps/cli/README.md), [worker](apps/worker/README.md), and
[durable job operations](docs/development/durable-jobs.md). Provider traffic
defaults disabled and queue commands require an explicit encryption key.

`pnpm checkout` starts the [local Fastify example](examples/fastify-checkout/README.md).
Receipt verification and host settlement/fulfillment remain separate records and
authority decisions. The example has no settlement or delivery write endpoint.

Release references: [compatibility](docs/development/compatibility.md),
[migrations](docs/development/migrations.md), [release policy](docs/development/release-policy.md),
[changelog](CHANGELOG.md), and [third-party licenses](THIRD_PARTY_NOTICES.md).
