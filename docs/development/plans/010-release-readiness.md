# First public library release

## Outcome and scope

Complete the roadmap with reviewed, versioned library artifacts and an honest
record of implementation, validation and publication. Release five library
packages under the independently verified personal @1hubengineering namespace.
Keep root/apps/examples/test infrastructure private. Use only 1hubengineering for
GitHub operations and its verified commit email. Never infer npm rights from GitHub.

## Evidence

Slices 0–6 are implemented. The latest local pnpm verify passed 234 fast/example/
application/provider tests, 234 shared cases across nine real engine/ORM cells,
11 frozen tests, strict types, five builds, publint and isolated npm consumers.
The selected SQLite ORM cells additionally passed three repeated crash/transaction
runs after removing unsafe overlapping native implementations from their harness.
Hosted acceptance is pending for commit 2c9b626. Packages remain private at 0.0.0.
The user confirmed original source ownership, GitHub verified the commit email,
and npm independently verified account/email/2FA. The user selected its matching
personal scope after andhub proved unavailable. No package/release is published.

## Steps

- [x] Review financial/security boundaries and fix consequential remaining failures.
- [x] Verify frozen originals, tracked data hygiene, dependency licenses and audit.
- [x] Document exact compatibility, migrations, retention and release policy.
- [x] Prepare 0.1.0 metadata and reviewed artifact/checksum tooling while private.
- [x] Run pnpm verify, review installed artifacts, commit and pass hosted Node 24/26.
- [ ] Remove private only from eligible libraries; verify/commit and pass exact-head CI.
- [ ] Verify identities/scope again, publish repository and stage/publish artifacts.
- [ ] Verify registry owners/integrity and installed registry consumers; create release.
- [ ] Reconcile roadmap/provenance/evidence and report actual publication or blockers.

## Validation

Do not replace actual engine checks with ORM mocks or skip frozen/reference gates.
Run the same verify command before each complete-slice commit. Confirm public npm
contents contain only compiled library output, declarations/maps, README, license,
manifest and Prisma model snippets; no credentials, databases, ZIP, test/app data
or unchecked historical claim API. Source provenance and third-party license grants
are separate. Runtime dependencies remain external, never relicensed as ISC.
No bank traffic or settlement proof is part of this release. CI requires both
minimum Node versions on Linux and the exact source commit before publication.
Registry state, owners and integrity—not a local tarball—prove published behavior.

## Decisions

- First release is 0.1.0, ESM-only, libraries in lockstep. Private operator/example
  apps are source examples rather than npm executable products.
- Keep API/engine promises narrow: only measured versions/cells, local SQLite,
  supported synthetic HTML layouts and bounded provider behavior. No live-provider
  availability, throughput, settlement or fulfillment guarantee.
- Repository URL is now known and may be recorded; do not invent maintainers.
- npm staging can defer mandatory 2FA to final approval of concrete reviewed
  tarballs. Current npm docs permit new packages via a public 0.0.0-stage placeholder;
  staged implementation remains unavailable until approved. Installed CLI 11.20.0
  meets the documented minimum. Do not disable 2FA or request credentials in chat.
- GitHub connector has no release/visibility tools; use the independently verified
  gh CLI for those authorized operations. Publishing consent is already in the goal.
- Sources: https://docs.npmjs.com/staged-publishing/,
  https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification/,
  https://docs.npmjs.com/trusted-publishers/.

## Handoff

Release audit in progress. Required access may still block final npm 2FA; prepare
all reviewable artifacts and independent gates before requesting that final action.

## Review finding: inactive SQLite scopes

The raw sqliteTransaction factory accepted an unstarted native handle and kept
accepting work after the caller ended its transaction. Such accidental host misuse
could autocommit part of a multi-record completion. Check database.open and
inTransaction at construction and before every scoped read/transaction. Installed
SQLite consumers now reject both unstarted and ended scopes; the shared suite
continues to prove legitimate host rollback/commit. PostgreSQL/MySQL public raw
client APIs have no equivalent active-scope marker; document the actual active
caller transaction requirement without inferring private driver internals.

## Candidate audit evidence

All ten original source/test/synthetic-fixture files again match the ignored ZIP
byte-for-byte; the archive SHA-256 remains the recorded baseline. Tracked-file
and credential-pattern checks found no ZIP/database/env/credential material.
`pnpm audit --prod --json` reported zero advisories across 67 total dependencies.
Third-party selected grants are recorded with the LGPL MariaDB host boundary
explicit, no bundled client/browser code, and upstream source checks where npm
license files were omitted. Implementation commit 2c9b626 passed hosted CI on both
minimum Node versions. Private 0.1.0 metadata and checksum tooling are prepared;
full candidate verification and clean-commit packaging follow.

## Private candidate acceptance

`pnpm verify` passed on Node 26.13.1 for the private 0.1.0 candidate: 234 fast/
application/example/provider cases, 234 real-engine contract cases, all 11 frozen
cases, five builds, formatting/lint/strict types, publint and isolated installed
consumers. The installed SQLite consumer now rejects both unstarted and ended
caller scopes. Full clean-commit artifact preparation and hosted candidate gates
follow the commit. GitHub login/verified primary email and npm login/verified
email/auth-and-writes 2FA were rechecked independently; all five registry names
currently return 404, which is not a name reservation or publication claim.

Clean-commit artifact execution caught a checker error: Prisma's exported schema
wildcard is a string, whereas the first checker assumed every export was a
condition object. Validate string/condition targets recursively and explicitly
require all three distributed Prisma snippets. The SDK installed consumers had
already passed; this was a release-checker failure, not missing package content.
Artifacts remain private/ineligible until the corrected clean-commit run succeeds.

## Eligibility gate

Corrected clean-commit preparation at 991ee9f validated all five private tarballs
and exported Prisma models. A repeated pack produced an identical manifest and
archive checksums. Both hosted Node 24/26 jobs passed at that exact commit
(run 44331393701). With implementation, review, source ownership, identity/scope,
licenses, local/hosted matrix, installed consumers and artifact gates satisfied,
remove private only from the five libraries. Root/apps/examples/tests stay private.
The final eligibility commit still requires its own verify/hosted checks before
any registry write. Registry ownership/integrity/installed verification tooling
is added for the actual publication step; no publication is claimed yet.

## Browser process gate reopened

Final review found Playwright's chromiumSandbox defaults false and launch inherits
process.env. CSP sandboxing is not Chromium OS sandboxing. A standalone actual
launch with chromiumSandbox=true and a locale/timezone-only environment passed
locally. Restore all five private flags while explicitly enabling the OS sandbox,
allowlisting browser environment, and proving seccomp/no inherited host secret via
actual process inspection of renderer seccomp filters/PID namespaces.
Headless shell does not expose chrome://sandbox, so inspect its real Linux
renderer state instead of changing the selected browser just for the test. Sandbox launch failures must stay
unavailable with no unsafe fallback. The earlier eligible-metadata verify passed
but does not satisfy this newly identified process gate; no registry write occurred.
Source: https://playwright.dev/docs/api/class-browsertype#browser-type-launch-option-chromium-sandbox.

Focused native browser validation passes with the sandbox enabled: renderer
seccomp filters exceed the broker's filter count, PID namespace depth increases,
and the actual child environment excludes an inherited synthetic host secret.
A failed sandbox launch returns unavailable once and the next valid call recovers
capacity. Explicit Ethiopian context time is also covered by a synthetic inline
Date rendering regression. Full local/hosted acceptance follows before eligibility.

All 12 focused CBE cases now pass with actual sandboxed Chromium, including the
existing network/DOM/infinite-script tests and new native isolation, failure
recovery and Ethiopian-date regressions. Environment assertions report booleans
so a failing test cannot dump inherited secret values into diagnostics.

The private sandboxed candidate passed full `pnpm verify` on Node 26.13.1:
237 fast/application/example/provider cases, 234 nine-cell storage/ORM cases,
11 frozen cases, all builds/checks/publint and installed consumers. The 12 CBE
cases include native Linux isolation, no-unsafe-fallback recovery and explicit
Ethiopian date rendering. The source remains private pending hosted sandbox
acceptance and fresh eligible artifacts. The registry integrity/owner/consumer
checker is ready but will only run against approved published versions.

Hosted c7ae3ed failed both runtime gates because browser launches were unavailable
on Ubuntu runners once native sandboxing was required. Local sandboxed tests
passed. Improve the test's launch-error diagnostic (without exposing browser
environment), and add the vendor-documented executable-scoped AppArmor userns
profile when the runner's namespace restriction is enabled. Keep the global
restriction enabled, target only the downloaded pinned Chromium binaries, and
unload those temporary profiles in workflow cleanup. This is disposable CI setup,
not an SDK fallback or a production system-wide policy change. Actual hosted
results must confirm the cause and the renderer seccomp/namespace assertions.
Sources: https://documentation.ubuntu.com/release-notes/24.04/ and
https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md.

## Stored evidence privacy boundary

A host plugin could return valid required fields plus rawHtml/receiptUrl extras,
or a malformed object in a required field. Completion previously persisted the
whole cloned evidence object despite promising normalized fields only. Select
known bounded string/integer fields and valid ambiguity names for storage; retain
the original comparison diagnostics (invalid remains INVALID/UNABLE_TO_VERIFY).
Add a regression on every real engine/ORM cell: valid extras can never enter the
attempt record, nested malformed values become null, and neither case changes
settlement authority. Providers remain trusted for authenticity; this enforces
the SDK's storage privacy shape without a new dependency or public API.

The evidence privacy regression passed on all nine real cells. The contract now
has 27 cases per cell (243 total); comparison diagnostics and receipt-only
settlement semantics stay unchanged. Full verify/hosted acceptance follows this
small privacy fix before any eligibility or registry operation.

Hosted 82514aa passed both Node 24/26 gates with the executable-scoped AppArmor
setup and mandatory actual renderer seccomp/PID namespace assertions. Local full
verification of the final evidence privacy fix passed 237 fast/application/provider
cases, 243 nine-cell contract cases, 11 frozen cases and all installed consumers.
The privacy commit's hosted checks and fresh artifacts remain the final private
source gates; no unsafe browser fallback or global namespace disable was used.
