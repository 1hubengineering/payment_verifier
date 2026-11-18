# Embedded Fastify checkout example

This slice is complete and included in [0.1.0](../releases/0.1.0.md). The acceptance
counts and next steps below record its original handoff; see the
[roadmap](../roadmap.md) for current scope.

## Outcome and scope

A private backend example embeds the configured verifier and optional queue into
host-owned authentication/orders. Clients submit only a locator and idempotency
header. Tenant/payment authority and expectations come from trusted host records;
receipt match never changes independent settlement or fulfillment. No website,
hosted service, live provider probe or new authentication product is required.

## Evidence

The operator slice passed full verification: 217 fast/application/provider tests,
234 shared cases on nine real database/ORM cells, 11 frozen tests and installed
consumers. Registry stable Fastify is 5.12.8; 6.0.0-alpha.6 is excluded. Official
Fastify docs cover inject testing, onRequest authentication and custom AJV options.
Its baseline removeAdditional behavior strips unsupported fields; choose false
so authoritative submission overrides are rejected rather than silently discarded.

## Steps

- [x] Implement injected host auth/order/admission/verifier/optional-queue boundary.
- [x] Reject authoritative body fields; scope every order/result lookup.
- [x] Keep settlement/fulfillment read paths independent of receipt results.
- [x] Add a loopback-only Varlock demo with no provider traffic.
- [x] Test Fastify.inject against real SQLite: auth, ownership, replay, bounds,
      snapshot changes, unavailable evidence, durable status and settlement split.
- [x] Document, review, pnpm verify and commit.

## Validation

Unauthenticated or wrong-owner/tenant requests never reach provider retrieval.
Malformed bodies and amount/recipient/provider/identity overrides return safe
errors. Verify immutable expectations, exact input replay and conflicting key
handling, reused receipts and terminal unavailability. Exercise queue capacity and
scoped status. Block excessive in-flight requests and host admission denials before
retrieval; permits recover after errors. A matched receipt and committed claim
leave host settlement/fulfillment unchanged. Tests are entirely synthetic and use
Fastify.inject, not external provider endpoints. Full matrix/package gates remain.

## Decisions

- Host authentication, order lookup, admission/rate policy, settlement and
  fulfillment are injected. No receipt endpoint can write settlement or delivery.
- The runnable demo uses explicit public synthetic session tokens and immutable
  synthetic orders, binds only 127.0.0.1 and configures no providers. It is not a
  production auth template; consumers bring existing host integrations.
- The example selects SQLite directly, without importing operator apps, browser
  dependencies or the workspace toolchain into the core. Other SDK integration
  claims come only from the separate real-engine matrix.
- Use the stable Fastify pin and its own test injection; no HTTP client/test
  framework dependency or additional schema library is needed.
- Sources: https://fastify.dev/docs/latest/Reference/Hooks/,
  https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/,
  https://fastify.dev/docs/latest/Guides/Testing/, official npm registry stable tags.

## Handoff

Sixteen injected-request cases passed against actual SQLite. An additional real
Varlock/loopback process test verifies the provider-free demo returns unverified
receipt evidence and closes its owned handle on SIGTERM. Review confirmed no
settlement/fulfillment write surface, strict extra-field rejection, trusted scope
and immutable snapshot checks before provider work, bounded admission and safe
errors. Full workspace/package acceptance passed after the SQLite harness isolation
correction below. The operator predecessor
6d1ced9 passed hosted Node 24/26 CI. All packages remain private; release review
follows this example. Provenance and publishing identities remain separate gates.

## Full-gate review discovery

The first full example gate passed all 234 fast/application/example cases but
failed 14 Drizzle SQLite cases after crash recovery; previous local and hosted
runs had passed. A targeted rerun passed, so repetition alone is not acceptance.
The ORM harness and child processes opened direct better-sqlite3 13 alongside
libSQL or Prisma's separate SQLite native build against the same file. SQLite
explicitly documents same-process multiple native copies as unsafe for POSIX
locking (https://www.sqlite.org/howtocorrupt.html, section 2.2.1). This is an
identified harness defect and plausible cause, not proof that a green rerun
resolves every client defect. Remove those overlapping handles, run the direct
migration owner/reset in separate short-lived processes, and repeat the actual
ORM crash/transaction suites. Production docs must state this ownership boundary.
Do not weaken assertions, reconnect supplied ORM clients or remove crash cases.

After isolation, both ORM SQLite cells passed once, then three sequential repeated
runs passed all 52 cases each (156 repeated cases), including every crash and
transaction assertion. The shared reset hook now also checks that the queue
control record is absent before every case. `pnpm verify` then passed on Node 26.13.1: 234 fast/application/example/provider
cases, all 234 shared real-engine cases, 11 frozen reference cases, builds,
format/lint/strict types, publint and isolated installed consumers. This change
does not broaden support to mixed native implementations in one process.
Hosted two-runtime acceptance is pending for this commit. Release readiness is
the next slice.
