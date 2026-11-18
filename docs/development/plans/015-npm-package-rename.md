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
- [x] Run local `pnpm verify`, pack a clean reviewed commit and confirm both hosted runtimes.
- [x] Stage the five archives for npm approval and record the stage IDs.
- [x] Verify public package metadata, archive integrity and registry-installed consumers.
- [x] Verify that the historical docs build using the GitHub release archives
      when the old npm tarball endpoints return HTTP 404.
- [ ] Unpublish eligible old versions in reverse dependency order. Check every result.
- [x] Update installation docs and release evidence after confirming public availability.

## Handoff

Source `fc9b4d0aa5bf4ee62dc6facd9fd5200bd1db6013` passed all 525 local tests
and [hosted Node 24 and 26 checks](https://github.com/1hubengineering/payment_verifier/actions/runs/44420597022).
All five clean archives passed checksum, npm dry-run and content checks. The
ten GitHub release assets were downloaded and checked against the catalog
hashes. An uncached docs build passed with all five legacy npm tarball
requests returning HTTP 404.

| Staged npm package (0.1.1)         | Stage ID                               |
| ---------------------------------- | -------------------------------------- |
| `@1hubengineering/verifier`        | `55a78da9-01a3-476e-bf72-6399688fb200` |
| `@1hubengineering/storage-sql`     | `096fedd3-4891-4806-bf80-c84d81a1384d` |
| `@1hubengineering/adapter-drizzle` | `d1271989-409c-471e-8470-33c9c2bee5ed` |
| `@1hubengineering/adapter-prisma`  | `584c794c-9f94-4cc2-ac3b-47724f789ad4` |
| `@1hubengineering/provider-cbe`    | `21ea8f22-4afc-488d-a002-54f2894e45bf` |

All five approved 0.1.1 versions are public with `latest=0.1.1`. The registry
consumer passed integrity and installed workflow checks. Removing the old CBE
package returned npm `EOTP`: unpublishing requires a separate interactive 2FA
approval. No old 0.1.0 package was removed.

The [GitHub v0.1.1 release](https://github.com/1hubengineering/payment_verifier/releases/tag/v0.1.1)
contains the verified archives, manifest and checksums. Current installation
docs and API reference target 0.1.1; the docs MCP can still answer 0.1.0 queries.
