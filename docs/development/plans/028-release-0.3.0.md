# Payment Verifier 0.3.0 release

## Outcome and scope

Publish five SDK packages from one reviewed commit, publish a matching GitHub
release, and bring the public documentation and Pages site to the same version.
The playground and benchmark applications remain private packages.

## Evidence

GitHub tags and releases ended at 0.1.1, as did the main-branch guide rendered on
Pages. The registry already served all five 0.2.0 archives as latest and the
0.2.0 record identifies their source and hashes. The unpublished source adds the
browser-safe comparison entry point, deployment diagnostics, a configurable
reference policy, provider handling, and idempotency hardening. Choose 0.3.0
because the public API and accepted order inputs changed before 1.0.

## Decisions

Work in a separate checkout. Reconcile the feature branch and main so both
histories survive. Include the SDK changes and related guide and UI work. Leave
the independent CLI deployment command, its plan and its guide in the original
working tree. Keep archived guide bodies and published archive hashes pinned.
Build the current API index from declarations of the tagged source.

Existing valid 0.2.0 records use the same SQL protocol. Old SDK processes may
reject expectations saved with newly accepted references. Upgrade readers and
writers together. Active 0.1.1 stores still require a claim-preserving cutover.

## Steps

- [x] Compare GitHub, Pages, npm and the local source.
- [x] Reconcile and review release changes and migrations.
- [ ] Verify workspace, clean archives, and a fresh installed consumer.
- [ ] Confirm hosted Node 24 and 26 checks on the exact release commit.
- [ ] Publish all five npm packages and verify owners, hashes, and install.
- [ ] Publish the GitHub tag and release, deploy Pages and confirm public links.

## Validation

Run `pnpm verify` with disposable databases and synthetic provider evidence.
Check that all private packages stay outside the five release archives. Use an
isolated consumer to exercise the browser export, receipt and replay workflow,
and an upgrade from persisted npm 0.2.0 data. Compare npm archives and GitHub
assets against the clean build. Check production Pages routes and examples over
HTTP after the Pages job succeeds.
