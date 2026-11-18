# 015 — Short npm package names

## Outcome and scope

Publish the five names in the [name assessment](../npm-name-assessment.md)
as 0.1.1, as requested. Keep repository folders, export subpaths, schema, private package
names and the existing GitHub v0.1.0 archive unchanged. Remove the old npm
versions only after all replacements are approved and verified, and only if
npm permits unpublishing.

## Evidence and decisions

The npm account is 1hubengineering with verified email and auth-and-writes 2FA.
The renamed packages start at 0.1.1. They include the workspace's tested Drizzle
v1 RC upgrade, which is a peer change for anyone migrating from the old names.
The old catalog is versioned and keeps the published 0.1.0
declarations. Its checksum-verified GitHub release copies remain available
after a registry unpublish. No provider or storage behavior changes in this slice.

## Validation and steps

- [x] Rename all five public manifests, workspace references and verification tooling.
- [ ] Run local `pnpm verify`, pack a clean reviewed commit and confirm both hosted runtimes.
- [ ] Stage the five archives for npm approval and record the stage IDs.
- [ ] Verify public package metadata, archive integrity and registry-installed consumers.
- [ ] Verify historical docs build independently of old registry names, then
      unpublish eligible old versions in reverse dependency order. Check every result.
- [ ] Update installation docs and release evidence after confirming public availability.

## Handoff

Pending build, staging and the user's npm approvals. Staging is not publication.
