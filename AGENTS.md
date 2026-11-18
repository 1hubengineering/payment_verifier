# Receipt library development

## Start here

Read `docs/library-plan/init-plan.md` first, then `docs/development/roadmap.md`
and the relevant package. `docs/library-plan/library-plan.md` explains the
embedded product. The master plan under `docs/archive/standalone-plan/` supplies financial and security
requirements; its service architecture is historical context, not an instruction
to build a hosted platform for every library task. The current audit is
`docs/development/workspace-audit.md`. Distinguish working code from planned support.
Use `docs/development/conventions.md` for current names, commands, and runtime policy;
older planning examples may describe superseded conventions.

## Workflow

- Prefer simplicity and concise wording. Use `pnpm <script>` for unambiguous
  script commands, including `pnpm verify`; add `run` only for a built-in name conflict.
- Inspect the workspace and Git status before edits; preserve unrelated work.
- For changes spanning packages, public contracts, storage, or security, write or
  update an execution plan under `docs/development/plans/` using `PLANS.md`.
  Carry authorized work through implementation, checks, and review. A plan is
  working documentation, not a mandatory approval checkpoint.
- Work in small vertical slices. Use deterministic synthetic evidence for tests;
  add regression cases for consequential behavior changes.
- Check version-sensitive tool choices against official documentation and registry
  stable tags. Prefer stable options, document local naming decisions as conventions,
  and add packages only for concrete dependency or integration boundaries.
- Use `pnpm` and Vite+. Node is pinned in `.node-version`; keep package versions and
  the lockfile under version control. Run `vp env install` then `pnpm install --frozen-lockfile`
  when preparing a new checkout.
- Run `pnpm verify` before handoff. During iteration use `pnpm test`,
  `pnpm test:reference`, `pnpm check`, or `pnpm typecheck` as relevant.
  `pnpm check:fix` fixes formatting/lint. `pnpm check:package` requires a build.
- Review against `docs/development/code-review.md`. Report changed behavior,
  actual check results, and remaining gaps. Update the roadmap when a gate changes.

## Boundaries

- `packages/receipt-verifier` is explicitly configured and has no runtime dependencies.
  No environment loading, ORM/driver imports, filesystem state, browser launches,
  network requests, or connection ownership at import time.
- Runnable apps own Varlock schemas. Storage and provider dependencies belong in
  their own packages only when implementation starts. Do not add empty published
  adapters or claim PostgreSQL/MySQL/SQLite/ORM support before integration tests.
- Hosts own authentication, orders, expected values, and fulfillment. Receipt
  submissions never supply authoritative amounts, recipient accounts, or identity.
- Use exact integer ETB minor units. Missing/ambiguous evidence fails closed;
  provider timeouts remain unavailable, not a false mismatch or payment success.
- Receipt match, local claim, settlement, and fulfillment are separate states.
  Receipt evidence alone never authorizes credit or delivery.
- Retrieval happens outside short storage transactions. Claims, evidence,
  idempotency results, and durable events must commit atomically. Caller-owned
  transactions/connections stay caller-owned. Claim scope is one shared store.
- Preserve the frozen synthetic reference under `tests/reference-cli`; port its
  behavior into library tests before replacing it. Do not expose its unchecked
  `claim()` or historical diagnostic bypass as a public library API.
- Do not commit real financial data, credentials, databases, or the original ZIP.
  No bank transfers, live provider probes, or external load tests are needed for
  routine development; use fixtures and local mocks.
- Keep packages private until release gates and provenance are resolved. Do not
  invent repository URLs, maintainers, registry access, or tested compatibility.

## Review guidance

Prioritize false matches, settlement confusion, idempotency/tenant isolation,
transaction races, recovery, SSRF, and installed-package behavior. Cite concrete
failures and file locations; do not treat roadmap promises as implemented controls.
