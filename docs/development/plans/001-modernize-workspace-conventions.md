# Modernize workspace conventions

## Outcome and scope

Use current stable tooling and documented commands, consistent package names,
and clear library boundaries. Update code, scripts, configuration, documentation,
and CI together. Preserve the frozen legacy evidence and original research plans.

## Evidence

On 18 November 2026, registry stable tags report Vite+ 1.7.0, TypeScript 7.0.2,
pnpm 12.21.0, Varlock 1.25.0, and publint 0.3.25: the existing pins already match.
Node 26.13.1 is the current stable LTS release. The latest Node 24 LTS patch is
24.22.3 and becomes the compatibility minimum. Node's type stripping is stable
and enabled by default.
The tsdown documentation identifies the explicitly selected `tsgo` declaration
generator as experimental. The current checkout action is older than its latest
stable release. See `../conventions.md` for sources and local design choices.

## Steps

- [x] Inspect the workspace, instructions, version pins, and official sources.
- [x] Align the core folder with its npm name; give the private CLI a product-specific name.
- [x] Standardize script names and explicit task execution; retain fail-closed package selection.
- [x] Select stable LTS development defaults, constrain advertised runtime majors,
      and use a documented declaration generator without an experimental compiler API.
- [x] Update CI actions, manifests, lockfile, and active documentation together.
- [x] Run full verification on both supported Node versions and review boundaries.

## Validation

- `pnpm install --frozen-lockfile` after regenerating the lockfile.
- `pnpm run verify` on Node 26.13.1 and Node 24.22.3.
- Core financial cases, the 11 original reference tests, app configuration,
  declaration generation, publint, and the isolated npm consumer must pass.
- Verify missing package filters fail instead of silently skipping work.
- Verify the frozen reference remains byte-identical and no active references
  use the old package path or old script names.
- Inspect CI action release SHAs against their official repository tags.

## Decisions

- Keep `@andhub/receipt-verifier`; it is descriptive and conforms to npm naming
  rules. Scope ownership remains unverified and packages remain private.
- Directory/package naming and script grouping are local conventions, not
  universal standards. Avoid new packages until their implementation needs them.
- Retain the Node 24 type-definition major to check the oldest supported runtime.
  Update its patch release without broadening the consumer API to Node 26-only APIs.
- Historical audit/plan results remain dated evidence; active guidance records
  the current commands, paths, and support policy.

## Handoff

Completed and reviewed:

- `pnpm install --frozen-lockfile` passed after the package move and type-definition update.
- `pnpm run verify` passed on Node 26.13.1, and
  `vp env exec --node 24.22.3 pnpm run verify` passed on Node 24.22.3.
- Each run passed 24 core cases, 11 reference cases, formatting/lint, strict
  workspace and isolated-declaration type checks, application configuration,
  ESM/declaration build, publint, and the isolated npm consumer's runtime/type checks.
- Declaration builds no longer emit the experimental compiler API warning.
- A nonexistent package filter exited unsuccessfully as required. A task dry run
  selected only the implemented library, excluding the root orchestrator.
- All ten frozen reference source/test/fixture files remain byte-identical to
  their original ZIP entries. Old paths and script names remain only in historical records.
- Official release tags resolved to the action commit SHAs recorded in CI.
  Hosted CI has not been executed; no cross-platform validation is claimed.

The next feature remains the provider-neutral comparison engine. This change adds
no provider, storage, settlement, or fulfillment behavior.
