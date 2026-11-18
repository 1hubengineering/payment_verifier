# Release policy

The first library release is 0.1.0. All five library packages share a version:
receipt-verifier, receipt-verifier-storage-sql, receipt-verifier-adapter-drizzle,
receipt-verifier-adapter-prisma and receipt-verifier-provider-cbe, under the personal
@1hubengineering namespace. Root, CLI, worker, example and test packages stay private.
ESM and exact [validated compatibility](compatibility.md) define the initial surface;
pre-1.0 contract changes require a documented minor release. Fixes use patch versions.
A new engine/client promise requires real contract and installed-consumer tests.

Keep libraries private until implementation, review, licensing/provenance, full
verification, both hosted runtime gates and independent npm access checks pass.
Run pnpm verify before each completed-slice commit. Final artifacts must come from
a clean reviewed commit with both Node 24/26 hosted checks green. Versioned release
metadata records the actual repository; npm maintainers come from registry identity,
never invented addresses or inferred GitHub rights. Use the verified GitHub account
and verified commit email, and independently confirm npm account/email/scope/2FA.

`pnpm release:prepare` rebuilds and packs only those five libraries from a clean checkout into
an ignored artifacts directory named by version and commit. It validates tar paths,
licenses, exports and rewritten internal versions, then writes SHA-256/SHA-512 and
integrity metadata plus SHA256SUMS. It never publishes. Private candidate artifacts
are labelled ineligible; eligible artifacts require private=false in each library.
Inspect npm publish --dry-run for the exact tarballs after gates pass. Never publish
apps, reference tests, original ZIP, databases, credentials or unreviewed worktree files.

Publish the repository only after source/data review. Stage or publish the reviewed
tarballs as 1hubengineering with public access. npm staging may create a public
0.0.0-stage placeholder for a new name; staged implementation is not yet available.
Final npm approval requires the account's 2FA. Complete that factor through npm's
own UI/CLI, never by posting credentials to chat or disabling security. Staging,
dry runs and GitHub login do not establish registry publication. See the official
[staging](https://docs.npmjs.com/staged-publishing/) and
[2FA](https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification/)
requirements. No npm OIDC/provenance attestation is claimed unless actually generated
and verified; local source ownership and tarball integrity are separate evidence.

After publication, run `pnpm release:check artifacts/<candidate>/manifest.json`.
It verifies each registry version, owner and dist.integrity against the reviewed
archive, downloads/checks both hashes and installs the registry versions in a
temporary npm consumer. The consumer exercises receipt/idempotency and durable
SQLite workflows, imports all five libraries and keeps settlement unconfirmed.
This complements the full installed tarball/real-engine suite before release. Attach the
same tarballs/checksums to the GitHub tag/release, with exact source commit, test
results, matrix, limits and npm links. Record publication in the roadmap/provenance
and release notes. Failed or partially published versions must be reported as such;
never overwrite a published version or claim an unapproved staged version is live.
