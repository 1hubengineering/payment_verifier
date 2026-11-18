# Changelog

## 0.1.0 — release candidate

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
