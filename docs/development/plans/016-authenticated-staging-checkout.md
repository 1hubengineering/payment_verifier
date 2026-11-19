# 016 — Authenticated staging checkout

## Outcome and scope

Extend the Fastify example so a host can accept a transaction number, receipt
URL, or SMS from a signed-in customer. Load the pending payment expectation
from the customer's authorized order and pass only the normalized locator to
the verifier. Keep the public checkout synthetic. This slice covers the staging
endpoint and tests, with no hosted deployment or live provider configuration.

## Evidence and decisions

- The Fastify example already accepts trusted host authentication, admission,
  order lookups, and a verifier or optional durable queue. Reuse those boundaries.
- Keep the original locator request compatible. The typed request accepts only
  `kind` and `reference`. The order sets the provider and expected payment values.
- Reuse the SDK locator allowlist. Use a dedicated response asking for the
  official CBE receipt link when a number or SMS cannot supply one. This path
  accepts no evidence and creates no manual review job.
- Send the canonical locator to the verifier so equivalent inputs share the
  existing idempotency and claim behavior. Keep raw SMS out of storage and errors.
- Use synthetic provider responses and real SQLite in the tests. Settlement and
  fulfillment remain independent host state.
- References: [Fastify validation](https://fastify.dev/docs/v5.7.x/Reference/Validation-and-Serialization/)
  and [request injection](https://fastify.dev/docs/v5.7.x/Guides/Testing/).

## Steps and validation

- [x] Add and document the typed request and authorized order response.
- [x] Test both providers, method mismatch, CBE missing links, and independent
      comparisons against server-owned amounts and recipients.
- [x] Test canonical idempotency replay, duplicate claims, timeouts and retry,
      cross-customer access, and independent settlement and fulfillment.
- [x] Run targeted Fastify tests, review the trust boundaries, and run `pnpm verify`.

## Handoff

The host supplies staging authentication, order storage, and a fixture-backed
verifier. The loopback runnable example accepts the typed input with providers
disabled. The React demo continues to use local mocks.

The targeted Fastify suite passed 39 tests. `pnpm verify` passed all 547
tests, the five installed-package checks, the Pages build, and the
documentation MCP smoke test. Hosted staging wiring requires the host
session and order services.
