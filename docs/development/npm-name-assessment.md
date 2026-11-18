# npm name assessment

Checked on 18 November 2026. This is a proposal, not a release plan in progress.

| Current name under `@1hubengineering` | Proposed name under `@1hubengineering` | Public registry |
| ------------------------------------- | -------------------------------------- | --------------- |
| `receipt-verifier`                    | `verifier`                             | HTTP 404        |
| `receipt-verifier-storage-sql`        | `storage-sql`                          | HTTP 404        |
| `receipt-verifier-adapter-drizzle`    | `adapter-drizzle`                      | HTTP 404        |
| `receipt-verifier-adapter-prisma`     | `adapter-prisma`                       | HTTP 404        |
| `receipt-verifier-provider-cbe`       | `provider-cbe`                         | HTTP 404        |

The [public npm registry](https://registry.npmjs.org/) returned no public package
for any proposed name. Authenticated `npm whoami` returned `1hubengineering`;
`npm access list packages 1hubengineering` returned read-write for all five
existing packages and no entries for the proposed names. The account previously
published 0.1.0 in this personal scope. This supports the proposal, but does not
reserve any name or prove that the current credentials can perform a first
publish under npm's 2FA and staging rules. See [scope rules](https://docs.npmjs.com/about-scopes/)
and [access checks](https://docs.npmjs.com/cli-documentation/access/).

## If approved

1. Recheck the exact names, account, and staging or publishing policy. Choose
   a new coordinated release version and build all five artifacts from one
   reviewed commit. Update package metadata, internal dependencies, and peer ranges
   together. Keep export subpaths, runtime APIs, and schema unchanged for the rename.
2. Validate installed consumers of the five proposed packages and test all engine
   cells before switching docs. Publish core before dependents, or stage and verify
   the whole set before promotion. Check the new registry tarballs and dist tags.
3. Existing users can stay on their current versions without changing the
   database. To migrate, replace the core and each installed companion together,
   update imports including subpaths such as `/postgres` and `/jobs`, refresh the
   lockfile, and run integration tests. Avoid loading two copies of the core:
   runtime class identity matters for errors such as `StorageConflict`.
4. Keep old versions and their tagged docs available. Announce the migration
   before considering an explicit deprecation, with a separately approved
   support window. Do not unpublish or silently change old version resolution.

Private workspace package names, Git tags, and the present SDK release are
unaffected by this assessment. No registry write was made.
