# Codex library workflow

Start each task from `docs/library-plan/init-plan.md`, current code, and the
roadmap. The library plan takes priority over historical standalone deployment
choices; retain the master plan's safety and correctness requirements.

## Daily loop

1. Inspect the workspace, tests, and Git diff. Reproduce the reported behavior.
2. For substantial work, create an execution plan following `PLANS.md`. Record
   contracts, failure semantics, and acceptance tests before expanding the API.
3. Implement one reviewable slice with synthetic fixtures. Keep application,
   provider, storage, and domain dependencies separate.
4. Run focused checks while iterating, then `pnpm verify` before handoff.
5. Review the diff using `code-review.md`; update plan progress and support claims.
6. Report actual behavior and evidence. Keep unproven compatibility visibly pending.

Useful task prompts:

> Read AGENTS.md and the roadmap. Implement the next core comparison slice using
> an execution plan, preserve the frozen baseline, and finish with pnpm verify.

> Review the current diff using docs/development/code-review.md. Prioritize
> correctness and installed-package regressions; cite concrete failure cases.

## Commands

| Command                          | Purpose                                                        |
| -------------------------------- | -------------------------------------------------------------- |
| `vp env install`                 | Install the pinned runtime and package manager                 |
| `pnpm install --frozen-lockfile` | Reproduce dependency resolution                                |
| `pnpm check` / `pnpm check:fix`  | Vite+ formatting, lint, and configured type checking / fixes   |
| `pnpm typecheck`                 | Strict workspace and package declaration-isolation checks      |
| `pnpm test` / `pnpm test:watch`  | New core tests / watch mode                                    |
| `pnpm test:reference`            | Original offline regression baseline                           |
| `pnpm check:env`                 | Application-local Varlock validation and local type generation |
| `pnpm build`                     | Build implemented library packages with Vite+ task selection   |
| `pnpm check:package`             | Publint and packed npm-consumer checks after build             |
| `pnpm verify`                    | Complete local and CI acceptance command                       |

## Codex setup choices

Repository `AGENTS.md` holds durable commands and invariants, and `PLANS.md`
defines substantial task handoffs. This follows the official guidance for
[repository instructions](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
and [execution plans](https://developers.openai.com/cookbook/articles/codex_exec_plans).
No global settings, model defaults, permissions, MCP servers, or paid integrations
are changed. A project config is unnecessary for the current workflow.

CI runs the same acceptance command on Node 26.13.1 and 24.22.3. GitHub branch
protection and automatic Codex review require a future connected repository;
the checked-in workflow does not configure those account settings.

The Node 26 LTS development pin is separate from the two supported library runtime
ranges. `pnpm verify` generates application-local environment types before
type checking. Its Vite+ tasks run without caching by default, so acceptance
results execute the checks. Build and package-lint tasks select `./packages/*`
explicitly and fail when the selection matches no packages; they do not recurse
into the root orchestrator. See [conventions](conventions.md) for naming and
the official sources behind these choices.

## Release discipline

Packages remain private during implementation. Before a first public release,
resolve package scope ownership and licensing, demonstrate all advertised storage
and ORM versions, verify tarball contents and dependency isolation, test failures
and concurrency, document migrations and consumer runtime support, and select
versioning/publishing automation. CI does not publish anything.
