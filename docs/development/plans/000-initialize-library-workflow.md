# Initialize the library development workflow

Historical initialization record. Current commands and paths are documented in
[workspace conventions](../conventions.md) and the
[modernization plan](001-modernize-workspace-conventions.md).

## Outcome and scope

Audit the current workspace, begin from `docs/library-plan/init-plan.md`, and
establish a reproducible Codex workflow for an embedded TypeScript library.
Deliver working checks and a minimal package boundary. Full provider, storage,
worker, and checkout implementation belongs to later slices.

## Evidence

The starting workspace was planning-only, with a placeholder manifest and a CLI
archive. There was no Git repository or test/build setup. The archived synthetic
suite reproduced 11/11 passing on Node 24.22.1 and 26.13.1. See the workspace audit
for source findings and the reference README for archive provenance.

## Steps

- [x] Read the library plans, standalone requirements, reference source and tests.
- [x] Reproduce the offline legacy baseline and document migration risks.
- [x] Initialize Git locally without a remote or initial commit; preserve existing plans.
- [x] Inspect official Vite+ templates and pin runtime/tool/package versions.
- [x] Add workspace configuration, strict type checks, ESM packing, and Varlock's app boundary.
- [x] Add Codex instructions, execution-plan and review guidance, roadmap, and CI definition.
- [x] Add exact ETB parsing and separate status types as a small meaningful core baseline.
- [x] Preserve the frozen synthetic regression suite and validate installed-package exports/types.
- [x] Organize historical standalone documents under `docs/archive/` and add a documentation index, retaining the active initialization path.
- [x] Complete the acceptance command, fix failures, and record final evidence.

## Validation

- `pnpm install --frozen-lockfile` must reproduce the workspace installation.
- `pnpm verify` must pass formatting/lint, strict compiler checks, financial
  boundary tests, 11 reference tests, Varlock validation, build, publint, and
  installation into an isolated npm consumer with runtime/type checks.
- Repeat the acceptance command on the second configured Node version.
- Verify malformed/out-of-bounds application configuration is rejected.
- Confirm the frozen ten reference files remain byte-identical to the archive.
- Review ignored files and tarball contents for private data or unwanted runtime dependencies.

## Decisions

- Use root AGENTS.md and PLANS.md, with focused linked workflow/review documents.
  Do not override personal Codex models, permissions, or integrations.
- Keep every package private until release requirements and provenance are resolved.
- Keep original planning documents and reference source unchanged.
- Prove packaging with a small domain primitive; do not ship fake provider or adapter APIs.
- Keep the three target databases as first-release requirements; implementation
  proceeds incrementally and support remains visibly unproven.

## Handoff

Validation completed:

- `pnpm install --frozen-lockfile` passed with the workspace lockfile.
- `pnpm verify` passed on Node 24.22.1; `vp env exec --node 26.13.1 pnpm verify`
  passed on Node 26.13.1. Both runs passed 24 core cases and all 11 reference tests,
  lint/format checks, strict TypeScript, Varlock validation, the ESM/declaration
  build, publint, and an isolated npm consumer's runtime and type checks.
- The packed archive contains only `package.json`, `README.md`, and three build
  artifacts. There are no runtime or peer dependencies in the core manifest.
- Malformed, zero, and above-limit `RECEIPT_TIMEOUT_MS` overrides were rejected.
- All ten frozen source/test/fixture files are byte-identical to archive entries.
  The original ZIP, generated configuration, databases, and download metadata
  are ignored by Git.
- TypeScript 7 declaration generation emits an upstream experimental-API warning;
  build output and the installed consumer's declaration checks pass. This does not
  establish compatibility for other compiler versions.

The next feature slice is the provider-neutral
expectation/evidence model and comparison engine. No receipt verification,
database/ORM adapter, worker, settlement, or fulfillment API is implemented in
the new package yet. GitHub CI is defined locally and has not run remotely.
