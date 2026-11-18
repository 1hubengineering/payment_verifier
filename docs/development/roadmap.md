# Library roadmap

The [initial direction](../library-plan/init-plan.md) defines the embedded-library
target. This roadmap records implemented and validated support separately from
publication. Historical examples are not additional compatibility promises.

| Slice                           | State                                | Evidence                                                                                                                                               |
| ------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0. Audit and foundation         | Complete                             | Pinned Node/pnpm/Vite+, Varlock startup schemas, frozen baseline, CI and installed consumers                                                           |
| 1. Domain and compare engine    | Complete                             | Immutable host expectations, exact integer ETB, explicit fail-closed checks; settlement always UNCONFIRMED                                             |
| 2. Provider evidence            | Complete; synthetic/local validation | Bounded allowlisted IPv4/TLS, linear bounded extraction, isolated CBE inline rendering; no live-provider claim                                         |
| 3. Storage and direct SQL       | Complete                             | Atomic claims/evidence/results/outbox, idempotency, rollback and process races on three real engines                                                   |
| 4. Drizzle and Prisma           | Complete                             | Native ORM queries/transactions; all nine direct/ORM cells pass the same 27 cases                                                                      |
| 5. CLI and durable worker       | Complete                             | Encrypted committed acceptance, bounds, retries/leases/fencing, actual crash/restart recovery, Varlock apps and graceful shutdown                      |
| 6. Fastify checkout             | Complete                             | Host auth/order/admission callbacks, strict locator-only input, scoped status, independent settlement/fulfillment                                      |
| 7. Release readiness            | Complete; 0.1.0 published            | Five npm versions verified by publisher, both hashes and installed workflow; public GitHub tag/assets match reviewed source                            |
| 8. Drizzle v1 RC source upgrade | Complete in source; not republished  | ORM/Kit 1.0.0-rc.5 from rc tags; full pnpm verify, all nine engine cells, installed relation-client types and local Kit checks pass; version unchanged |

Published 0.1.0 acceptance: **237 fast/application/example/provider cases,
243 real-engine contract cases (nine cells × 27), and 11 frozen reference cases**,
plus environment/schema generation, five builds, formatting/lint/strict types,
publint and isolated installed npm consumers. The release source commit
[c4464f0](https://github.com/1hubengineering/verify_payment_v1/commit/c4464f0f26db808806d4877fc57b0254ba495c38)
passed full hosted CI on Node 24.22.3 and 26.13.1:
[run 44339379792](https://github.com/1hubengineering/verify_payment_v1/actions/runs/44339379792).
Source and all five npm 0.1.0 implementations are public. Registry publisher and
maintainer checks, SHA-256/SHA-512 integrity and a fresh registry-installed
receipt/idempotency/durable-job consumer passed. Settlement remains UNCONFIRMED.
[Release v0.1.0](https://github.com/1hubengineering/verify_payment_v1/releases/tag/v0.1.0)
was published as 1hubengineering at 2026-11-18 16:22:13 UTC. Its tag points to the
reviewed source above; anonymous downloads of all seven assets match the reviewed
files. [Release evidence](releases/0.1.0.md) includes all package links and hashes.
The 0.1.0 release gates are complete. The post-release v1 RC source upgrade is
tracked in [plan 011](plans/011-drizzle-v1-upgrade.md). It keeps package version
fields at 0.1.0 by explicit user instruction; npm cannot overwrite the existing
versions, so this source change is distinct from registry publication.

The [workspace compatibility matrix](compatibility.md) lists the new RC boundary;
the immutable v0.1.0 release uses Drizzle 0.45.4. Direct Kysely, Drizzle and
Prisma 7.10.1 each cover PostgreSQL, MySQL and
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
Only the five released libraries have private=false; root/apps/examples/tests stay
private. [Release policy](release-policy.md) and [plan 010](plans/010-release-readiness.md)
record clean-commit checksums, independent authentication and verified publication.

Implementation plans retain detailed evidence:
[domain](plans/002-domain-comparison.md), [providers](plans/003-provider-evidence.md),
[SQL](plans/004-storage-contract.md), [ORMs](plans/005-orm-adapters.md),
[parser bounds](plans/006-parser-resource-bounds.md), [jobs](plans/007-durable-jobs.md),
[operator apps](plans/008-cli-worker.md), [checkout](plans/009-fastify-checkout.md),
[Drizzle v1 RC upgrade](plans/011-drizzle-v1-upgrade.md).

The v1 RC source upgrade passed full local pnpm verify with the same 237/243/11
case counts, plus four Kit local up/check/export checks. All 81 Drizzle cases use
the new RC. Installed consumers verify relation-configured client types as well
as transaction ownership. The bundled revision-15 skill is loaded; project-local
MCP config and a direct tools-list handshake are verified. Reload Codex to activate
the newly saved server in the current client. No host database migration was run.
