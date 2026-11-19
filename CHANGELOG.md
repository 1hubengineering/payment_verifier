# Changelog

## Unreleased

- Reject malformed evidence on bound idempotency keys.
- Report Chromium startup failures as `RECEIPT_BROWSER_UNAVAILABLE`.
- Add the browser-safe `/comparison` export and expand provider fixture handling.
- Add private verification playground and benchmark packages.

## 0.2.0

- Support receipt IDs, official receipt URLs, and SMS through a shared browser-safe
  input parser. Report structured verification outcomes and check details.
- Match exact ETB amounts by default and support optional host-configured tolerance.
- Initialize a fresh verifier store for new installations. Keep active 0.1.1
  stores on 0.1.1 until a supported cutover preserves their existing claims.
  See the [0.2.0 npm release evidence](docs/development/releases/0.2.0.md).

## 0.1.1

- Publish the core as `@1hubengineering/verifier` and shorten its four
  companion names. See the [migration guide](docs/development/npm-name-assessment.md#migration)
  for the package map. Export subpaths and the storage schema are unchanged.

- Select drizzle-orm@rc and development-only drizzle-kit@rc, tested at
  1.0.0-rc.5.
- Adapt asynchronous transaction classes, column builder types, AnyRelations
  generics and caller-owned `drizzle({ client })` construction.
- Add installed-consumer checks for v1 relation-configured clients and local Kit
  up/check/schema-export validation. Preserve the shared v1 schema/migration owner.
- Install Kit's revision-15 agent skill and project-local Codex MCP configuration;
  verify stdio tools listing without invoking database operations.

The archived v0.1.0 tarballs still use Drizzle 0.45.4.

## 0.1.0

- Exact ETB comparison with immutable host expectations and explicit fail-closed
  evidence checks; receipt match always retains settlement UNCONFIRMED.
- Bounded Telebirr retrieval and synthetic layout parsing; optional isolated CBE
  inline browser rendering, with timeout/SSRF/resource-bound failure tests.
- Atomic shared-store claims, evidence, idempotent results and durable events across
  nine selected PostgreSQL/MySQL/SQLite direct, Drizzle and Prisma 7 integrations.
- Optional encrypted durable jobs with bounded admission/aliases, leases, retry
  backoff/provider pause, stale-owner fencing, retention and process crash recovery.
- Private operator CLI/worker and embedded Fastify checkout example, keeping host
  authentication, order authority, settlement and fulfillment separate.

Linux Node 24.22.3/26.13.1 are the supported minimums. Compatibility is restricted
to the [tested matrix](docs/development/compatibility.md). No live-provider,
settlement, fulfillment, throughput, other ORM/client or public deployment proof
is implied. Publication status is recorded in the roadmap and release evidence.
