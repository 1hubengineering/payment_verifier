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
- [ ] Run pnpm verify, review installed artifacts, commit and pass hosted Node 24/26.
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
