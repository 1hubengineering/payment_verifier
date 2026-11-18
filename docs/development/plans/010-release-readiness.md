# First public library release

## Outcome and scope

Release five 0.1.0 ESM library packages in lockstep under the independently
verified personal @1hubengineering namespace. Root, CLI, worker, example and tests
stay private. GitHub commits/pushes/publishing/releases use 1hubengineering and its
verified commit email. Npm identity/scope/licensing are independent gates.

## Evidence

Final private source commit d60786a passed full local and hosted Node 24.22.3 /
26.13.1 acceptance: 237 fast/application/example/provider cases, 243 shared cases
on nine real engine/ORM cells, all 11 frozen cases, schema/config generation,
five builds, formatting/lint/strict types, publint and isolated npm consumers.
Hosted [run 44337692743](https://github.com/1hubengineering/payment_verifier/actions/runs/44337692743)
is green on both runtimes. Earlier source commits and discoveries remain in their
slice plans/Git history. Final eligible source c4464f0 passed the same full local checks and hosted
[run 44339379792](https://github.com/1hubengineering/payment_verifier/actions/runs/44339379792)
on both runtimes. All five 0.1.0 registry versions are now public. Publisher,
maintainer, SHA-256/SHA-512 and installed registry receipt/job checks passed.
[Release v0.1.0](https://github.com/1hubengineering/payment_verifier/releases/tag/v0.1.0)
was published as 1hubengineering at 2026-11-18 16:22:13 UTC. Its tag points to
c4464f0 and all seven public assets match the reviewed files.

## Steps

- [x] Review financial/security boundaries and fix consequential findings.
- [x] Verify frozen originals, tracked-data hygiene, licenses and production audit.
- [x] Document exact compatibility, migrations, retention and release policy.
- [x] Prepare version metadata and clean-commit artifact/checksum tooling.
- [x] Verify private source, review installed artifacts, commit and pass both hosted runtimes.
- [x] Remove private only from eligible libraries; verify/commit and pass exact-head CI.
- [x] Recheck identities/scope, publish repository and stage reviewed artifacts.
- [x] Resolve npm approval/publication discrepancy and observe all five registry versions.
- [x] Verify registry owners/integrity and installed registry consumer; create release.
- [x] Reconcile roadmap/provenance/release evidence with staged status and concrete blocker.
- [x] Reconcile roadmap/provenance/release evidence with verified public release.

## Validation

Run pnpm verify before completed-slice commits. Do not replace actual engine tests
with ORM mocks, weaken assertions or modify frozen reference files. Clean artifact
preparation rebuilds current source and validates tar paths, licenses, exports,
Prisma model snippets and rewritten internal versions, then records SHA-256,
SHA-512 integrity and source commit. Private artifacts remain explicitly ineligible.
Only compiled SDK output/declarations/maps, README/license/manifest and Prisma
snippets belong in npm tarballs; no ZIP, database, credentials, app/test data or
unchecked historical claim API. Public registry state/owners/integrity and an
actual registry-installed receipt/job workflow establish publication.

## Review findings and decisions

- Inactive SQLite caller scopes could autocommit after host transaction end.
  Check native open/inTransaction state at construction and every scoped use;
  installed regressions reject unstarted and ended scopes. Raw pg/mysql2 hosts
  must keep actual Serializable transactions active; infer no private driver state.
- ORM SQLite tests overlapped different native builds on one file in one process,
  violating SQLite's documented POSIX locking boundary. Separate migration/reset
  maintenance and remove parallel direct handles from ORM workers. Keep actual
  race/crash assertions; do not reconnect caller clients. Repeated suites and full
  hosted acceptance pass under this corrected, documented ownership boundary.
- Playwright defaults its OS sandbox off and inherits process.env. Require native
  sandboxing and a locale/timezone-only child environment, with explicit Ethiopian
  context time. Actual Linux tests inspect child environment, additional renderer
  seccomp filters and PID namespaces, plus unavailable failure/no unsafe fallback.
  Headless shell lacks chrome://sandbox, so inspect real process state instead.
- Ubuntu CI initially refused sandboxed browser launches. A temporary executable-
  scoped AppArmor userns profile for the two pinned Chromium binaries enables the
  mandatory native assertions while keeping the global restriction enabled.
  Cleanup unloads only those profiles. Hosted 82514aa and d60786a both pass.
  Production hosts still supply unprivileged worker filesystem/memory confinement.
- Provider extras/nested malformed evidence could reach attempt storage. Persist
  only known bounded primitives/valid ambiguity names while preserving original
  INVALID/UNABLE_TO_VERIFY checks. The regression passes all nine integrations.
- The first artifact checker assumed every export was a condition object; Prisma
  also has a schema wildcard string. Validate targets recursively and require all
  three model files. Corrected private artifacts passed and repeated packing was
  byte-identical. Rebuild during preparation so stale ignored dist is never trusted.
- Core has no npm runtime/peer dependencies. Runtime clients/browsers remain external,
  with their own grants; the host-selected mariadb connector remains LGPL-2.1-or-later.
  No dependency code/browser/provider data is bundled or relicensed as ISC.
- Use narrow tested versions, local SQLite, synthetic layouts and bounded behavior.
  No live-provider, throughput, settlement, fulfillment or hosted-service claim.
- Publishing is already authorized by the goal. The GitHub connector lacks release/
  visibility operations, so the verified gh CLI handles them. Npm staging can defer
  mandatory 2FA until reviewed tarballs are approved; a new name may get a public
  0.0.0-stage placeholder without exposing staged implementation. Never disable
  2FA, request credentials in chat or infer npm rights from GitHub authentication.
  No OIDC/provenance attestation is claimed without generating/verifying one.

Sources: [npm staging](https://docs.npmjs.com/staged-publishing/),
[npm 2FA](https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification/),
[Playwright sandbox option](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-option-chromium-sandbox),
[Ubuntu user namespaces](https://documentation.ubuntu.com/release-notes/24.04/),
[SQLite native-copy locking](https://www.sqlite.org/howtocorrupt.html).

## Audit results and handoff

The user confirmed original source ownership; ISC grant files and provenance are
present. Ten original source/test/fixtures still match the ignored ZIP byte-for-byte;
its SHA-256 remains a71dee9c5307a675a34b5b7816caca1eed3a351fcfdcfc949a2c7e16046e0607.
Tracked-path/credential-pattern review found no ZIP/database/env/credential material.
Production audit reports zero advisories across 67 total dependencies. Selected
external grants were checked in manifests/license files and upstream sources where
npm omitted files. GitHub login/verified primary email and npm login/verified email/
auth-and-writes 2FA were independently rechecked; all five names initially returned
404, which is no reservation or publication proof.

Implementation, final eligibility metadata, clean rebuilt artifacts, exact-head
hosted checks and publication are complete. Earlier npm lookups briefly remained
staged/404 after the user reported approval; CLI approval also returned E404 for a
readable stage. These observations were not treated as successful publication.
Subsequent fresh lookups exposed all five versions, the user confirmed website
success, and the registry checker passed before the GitHub draft was published.
No stage was deleted/restaged and no security setting was weakened.

`pnpm release:check artifacts/v0.1.0-c4464f0f26db/manifest.json` verified all five
actual registry versions, 1hubengineering publisher/maintainer, both archive hashes
and an isolated registry-installed receipt/idempotency/durable-job workflow.
All latest tags are 0.1.0 and npm stage list is empty. Public release v0.1.0 is
at c4464f0f26db808806d4877fc57b0254ba495c38 with author 1hubengineering. Anonymous
downloads of all seven assets match the reviewed archives/checksum/source manifest.

Only the five libraries have private=false. Root/apps/examples/tests stay private
npm packages. The release source passed local pnpm verify and both hosted minimums
with 237 fast/provider/app cases, 243 real-engine cases and 11 frozen cases plus
builds/types/lint/publint and isolated installed consumers. Documentation-only
handoff commits preserve the immutable release source and tarballs. Final
pnpm verify is required before the publication-reconciliation commit; hosted CI
runs the same checks. No required access or material decision remains.

[Release evidence](../releases/0.1.0.md) records the actual package/release links,
source commit, exact matrix boundaries, hashes and validation commands.
