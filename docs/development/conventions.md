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

| Location                                                  | npm name / role                                                                                       |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `packages/receipt-verifier`                               | `@andhub/receipt-verifier`: public library API and provider-neutral domain                            |
| `apps/cli`                                                | `@andhub/receipt-verifier-cli`: private executable application boundary; currently configuration only |
| `tests/reference-cli`                                     | Frozen synthetic source and regression evidence; never a runtime dependency                           |
| `scripts`                                                 | Workspace verification utilities                                                                      |
| `examples/<framework>-<scenario>`                         | Consumer applications when implemented, such as `fastify-checkout`                                    |
| `docs/library-plan` / `docs/development` / `docs/archive` | Original direction / current workflow and execution plans / historical requirements                   |

Use lowercase, descriptive, hyphenated npm names, as recommended by
[npm package metadata guidance](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#name).
The scope `@andhub` is provisional: ownership and publishing access have not been
verified. All packages remain private. No registry name reservation is claimed.

For future independently installed integrations, use a consistent product prefix:

| Planned folder                              | Planned npm name                           | Reason to split                                     |
| ------------------------------------------- | ------------------------------------------ | --------------------------------------------------- |
| `packages/receipt-verifier-storage-sql`     | `@andhub/receipt-verifier-storage-sql`     | SQL drivers, migrations, and connection integration |
| `packages/receipt-verifier-adapter-drizzle` | `@andhub/receipt-verifier-adapter-drizzle` | Drizzle peer/version and transaction contract       |
| `packages/receipt-verifier-adapter-prisma`  | `@andhub/receipt-verifier-adapter-prisma`  | Versioned Prisma client and transaction contract    |
| `packages/receipt-verifier-provider-cbe`    | `@andhub/receipt-verifier-provider-cbe`    | Optional browser execution dependencies             |

Create these only with actual implementation. Small providers may remain core
subpath exports when their dependencies and release needs do not justify a new
package. A future worker belongs in `apps/worker`, not a published provider package.
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
workflow. Local checks validate the package; hosted CI has not run in this workspace.
Current automation is exercised on Linux; no macOS or Windows validation is claimed.
