# Library roadmap

The [initial direction](../library-plan/init-plan.md) defines the embedded-library
target. This roadmap records implemented and validated support separately from
publication. Historical examples are not additional compatibility promises.

| Slice                        | State                                | Evidence                                                                                                                          |
| ---------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| 0. Audit and foundation      | Complete                             | Pinned Node/pnpm/Vite+, Varlock startup schemas, frozen baseline, CI and installed consumers                                      |
| 1. Domain and compare engine | Complete                             | Immutable host expectations, exact integer ETB, explicit fail-closed checks; settlement always UNCONFIRMED                        |
| 2. Provider evidence         | Complete; synthetic/local validation | Bounded allowlisted IPv4/TLS, linear bounded extraction, isolated CBE inline rendering; no live-provider claim                    |
| 3. Storage and direct SQL    | Complete                             | Atomic claims/evidence/results/outbox, idempotency, rollback and process races on three real engines                              |
| 4. Drizzle and Prisma        | Complete                             | Native ORM queries/transactions; all nine direct/ORM cells pass the same 27 cases                                                 |
| 5. CLI and durable worker    | Complete                             | Encrypted committed acceptance, bounds, retries/leases/fencing, actual crash/restart recovery, Varlock apps and graceful shutdown |
| 6. Fastify checkout          | Complete                             | Host auth/order/admission callbacks, strict locator-only input, scoped status, independent settlement/fulfillment                 |
| 7. Release readiness         | Eligible; final publication pending  | Source/licensing/identity/matrix gates passed; final eligible artifacts, registry approval and release verification remain        |

Current source acceptance: **237 fast/application/example/provider cases,
243 real-engine contract cases (nine cells × 27), and 11 frozen reference cases**,
plus environment/schema generation, five builds, formatting/lint/strict types,
publint and isolated installed npm consumers. Commit d60786a passed full hosted
CI on Node 24.22.3 and 26.13.1:
[run 44337692743](https://github.com/1hubengineering/verify_payment_v1/actions/runs/44337692743).
The final metadata/artifact commit requires its own exact-head gates before a
registry write. No npm implementation or GitHub release is published yet.

The [compatibility matrix](compatibility.md) lists exact engine/client versions.
Direct Kysely, Drizzle 0.45.4 and Prisma 7.10.1 each cover PostgreSQL, MySQL and
local SQLite. Real host transaction commit/rollback, independent clients/processes,
claim races, response-loss replay and durable SIGKILL recovery run on every cell.
Different SQLite native implementations must not hold one file in the same
process; the ORM migration/reset owner runs in a separate process. Three repeated
SQLite ORM runs followed that harness correction. libSQL 0.18.0, Prisma 8,
remote SQLite and other untested combinations remain outside the release promise.

Provider tests use synthetic HTML and local mocks. CBE requires its explicit
Playwright peer/matching Chromium, an unprivileged host supporting OS sandboxing,
and host worker confinement. Tests inspect actual renderer seccomp/PID namespaces
and exclude inherited host secrets; failed sandbox launch never falls back to an
unsafe browser. Ubuntu CI grants namespaces only to two pinned browser executables,
keeps its global restriction enabled and removes temporary profiles afterward.
External assets, IPv6, redirects, compressed bodies and unsupported layouts fail
closed. No bank transfer or live provider probe was used.

[Durable jobs](durable-jobs.md) share the configured store and atomically finish
with verification effects. They bound admission/aliases/retention and provider
work, encrypt locators/primary keys, fence stale workers, preserve accepted work
across crashes, and prune only completed jobs with acknowledged events. Claims and
committed results remain. Hosts own authentication, orders, expected values,
independent settlement, fulfillment, backups and repeat-safe event delivery.
Stored evidence contains only known bounded primitives; raw plugin extras and
nested malformed values cannot enter attempts or turn into matches.

The private [CLI](../../apps/cli/README.md), [worker](../../apps/worker/README.md)
and [checkout example](../../examples/fastify-checkout/README.md) demonstrate actual
SDK use. Traffic defaults disabled; saved HTML diagnostics cannot claim. The
loopback example has no providers and no settlement/delivery write endpoint.

Release identity is independently verified: GitHub 1hubengineering with its
verified primary commit email; npm 1hubengineering with verified email and 2FA,
using the user's selected personal @1hubengineering namespace. Source ownership
and ISC are recorded in [provenance](provenance.md); external grants are in
[third-party notices](../../THIRD_PARTY_NOTICES.md). All ten frozen originals
still match the ignored ZIP byte-for-byte. Production audit found zero advisories.
Only the five eligible libraries lose private flags; root/apps/examples/tests stay
private. [Release policy](release-policy.md) and [plan 010](plans/010-release-readiness.md)
record clean-commit checksums, final npm authentication and actual publication.

Implementation plans retain detailed evidence:
[domain](plans/002-domain-comparison.md), [providers](plans/003-provider-evidence.md),
[SQL](plans/004-storage-contract.md), [ORMs](plans/005-orm-adapters.md),
[parser bounds](plans/006-parser-resource-bounds.md), [jobs](plans/007-durable-jobs.md),
[operator apps](plans/008-cli-worker.md), [checkout](plans/009-fastify-checkout.md).
