# Ethiopian receipt verification library

A TypeScript library workspace for embedding receipt verification into an
existing backend. Receipt comparison and bounded provider evidence retrieval are implemented with
synthetic/local validation; database adapters are still planned. A receipt match will remain distinct from settlement.

## Develop

Install the [Vite+ CLI](https://www.viteplus.dev/guide/), then:

```sh
vp env install
pnpm install --frozen-lockfile
pnpm verify
```

`pnpm setup:browsers` installs Chromium for the optional CBE integration tests.

Node **26.13.1 LTS**, pnpm **12.21.0**, Vite+ **1.7.0**, and TypeScript **7.0.2**
are pinned. CI also validates Node **24.22.3 LTS**. The original ISC manifest designation is
preserved; public licensing and reference provenance are release decisions.

| Location                    | Current responsibility                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------ |
| `packages/receipt-verifier` | Exact ETB parsing, immutable expectation snapshots, pure receipt comparison; ESM and declarations      |
| `apps/cli`                  | App-local Varlock schema validation; CLI implementation is pending                                     |
| `tests/reference-cli`       | Frozen 11-test offline reference, including a cross-process SQLite race                                |
| `scripts/check-package.mjs` | Pack the library, install with npm in a temporary consumer, validate JavaScript and TypeScript exports |
| `docs/development`          | Audit, roadmap, workflow, review criteria, and execution plans                                         |

`pnpm verify` validates app configuration first, then runs formatting/lint/type checks, core tests, the original synthetic
baseline, application configuration validation, library build, publint, and the
installed-package checks. No bank requests or database services are required. Chromium tests use local mocks.

Use the [documentation index](docs/README.md) to find active and archived material.
The [workspace conventions](docs/development/conventions.md) explain package naming,
boundaries, supported runtimes, and the sources checked for tooling decisions.
Start with [init-plan.md](docs/library-plan/init-plan.md), then the
[audit](docs/development/workspace-audit.md), [workflow](docs/development/workflow.md),
and [roadmap](docs/development/roadmap.md). Codex reads repository conventions from
[AGENTS.md](AGENTS.md).
