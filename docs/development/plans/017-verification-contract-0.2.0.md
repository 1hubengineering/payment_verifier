# 017 · Verification contract and automatic intake for 0.2.0

## Outcome and scope

Implement the approved five-outcome SDK contract and shared CBE/Telebirr input parser across
the SDK, durable jobs, CLI, checkout examples, and active documentation. Hosts own order
expectations and business effects. Official verification requires all configured checks and a
committed receipt claim. The response redesign is a breaking pre-V1 change, so 0.2.0
follows the minor-version rule in the [release policy](../release-policy.md). Adopt the
new response contract across all public surfaces and remove the old fields and aliases.
Include [host-configured amount matching](018-amount-matching-policy-0.2.0.md) as a focused
slice after the comparison contract and before the final adapter and release checks.

## Evidence and decisions

- The old locator requires the expected provider and a URL for CBE. A pure browser subpath
  identifies all six input forms. The server reparses and builds the official URL.
- The historic CBE diagnostic reads saved HTML. The archived CLI navigates directly and
  waits for two receipt markers. The current adapter retains the markers but supplies
  bounded HTTPS HTML to an isolated browser. External resource needs are unverified.
- Previous completed records lack evidence required by the new response contract. Keep their
  original outcomes in the archive. `VERIFIED` requires sufficient official evidence and a
  committed claim under the new contract.
- Queue coalescing applies to pending jobs only. Previously bound keys retain exact replay
  and a fresh key can request verification after a terminal outcome.

## Steps and validation

- [x] Add pure input detection and the browser package entry, and test all six forms.
- [x] Add typed checks, provider outcomes and diagnostics, and synthetic provider coverage.
- [x] Integrate atomic results, operation errors, replay, and bounded durable jobs.
- [x] Implement the amount policy slice and verify its stored check diagnostics, replay,
      and claim protection across the adapter matrix.
- [x] Update CLI, checkout, active docs, all five candidate manifests, and the in-progress
      incompatible-store diagnostic for 0.2.0.
- [x] Test the development cutover against a 0.1.1 fixture store. Verify the archive retains
      original records, the old store is rejected by the 0.2.0 startup path, and the fresh
      store initializes with an empty active claim history. Verify the SDK takes no reset action against the legacy store.
- [x] Run targeted tests, the nine real-engine adapter cells, and `pnpm verify`. Check both
      supported Node lines and validate the installed tarballs from a clean, reviewed commit.

## Development and testing store cutover

1. Confirm the database and its configuration belong to development or testing. Stop new
   submissions, drain pending work with 0.1.1, and stop writers and workers.
2. Create an engine-consistent backup and verify it is readable. Retain any required queue
   encryption key securely and separately. Keep the archive read-only and outside the active
   database configuration. Use 0.1.1 for historical reads.
3. Point 0.2.0 at a fresh database or SQLite file and initialize the new schema and record
   version. Retire the old development payment IDs and start with fresh fixtures. The active
   store starts with empty expectations, attempts, claims, jobs, and outbox records.
4. Preserve archived records as written. Never synthesize receipt snapshots, promote legacy
   attempts to `VERIFIED`, or import archived claims into this fresh development store.
   Refuse the reset for production or active merchant stores.

## Release gate

Keep preparation local until implementation and all applicable pre-publication checks in the
release policy are complete. Report the commands and actual results, provider fixture findings,
and development cutover instructions. Publishing and deployment remain a separate release
decision.

## Handoff

The 0.2.0 API, integrations, and amount policy are implemented on the local feature branch.
`pnpm verify` passed on Node 26.13.1 and 24.22.3, including 295 SDK, CLI, provider, and backend tests,
13 browser example tests, 297 adapter cases across nine integration cells, and 11 frozen
reference tests. Installed package checks, the static site build, and the docs MCP smoke
test also passed. The standalone site tasks build the browser parser before consuming its package export.
All five 0.2.0 manifests are private pending the separate publication decision.

The CBE historical saved-HTML helper and archived navigation path were reviewed offline.
Current tests use isolated Chromium and synthetic provider responses. External resource
requirements and provider-specific absence formats remain unverified. Built-in adapters
keep unexplained 404 responses as retrieval errors. No existing database was reset.
