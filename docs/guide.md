## Installation

Install the renamed core in an existing Node.js backend:

```sh
npm install @1hubengineering/verifier@0.1.1
```

The [core SDK quickstart](../packages/verifier/README.md) shows the imports,
receipt comparison, explicit verifier setup, and durable jobs. The published
libraries are ESM; the tested Node versions and exact integration candidates are
listed in the [compatibility matrix](development/compatibility.md).

## Configuration

Authenticate callers in your backend and look up their orders there. Store the
expected amount as integer ETB minor units. Derive the recipient and accepted
provider from trusted order data. Treat a submitted receipt as evidence, not as
an authoritative source for any of those values.

Pass configured providers and a shared claim store to the SDK. Keep receipt
retrieval outside storage transactions and use an idempotency key for a logical
submission. Provider unavailability is not a mismatch. A matched receipt and a
local claim do not confirm settlement or authorize fulfillment. Confirm both
independently through your host application.

## Supported integrations

- [Direct SQL](../packages/storage-sql/README.md): PostgreSQL,
  MySQL, and SQLite with explicit migrations and caller-owned connections.
- [Drizzle](../packages/adapter-drizzle/README.md) and
  [Prisma](../packages/adapter-prisma/README.md): tested SQL
  integrations. The renamed Drizzle adapter targets the tested v1 release
  candidate; the old 0.1.0 adapter targeted `0.45.4`. Check the matrix before installing peers.
- [CBE provider](../packages/provider-cbe/README.md): optional
  browser-backed retrieval with host confinement and the Chromium sandbox.
  Do not probe live providers to test a checkout.
- [Durable jobs](development/durable-jobs.md): bounded asynchronous work with
  shared storage, scoped lookups, and repeat-safe host event handling.

## Customize checkout

The [React checkout example](../examples/checkout-web/README.md) accepts typed
branding, order lines, method labels and instructions, and replaceable help and
order-footer sections. Pass a receipt submission callback that talks to your
authenticated backend. Store expected values, idempotency, settlement, and
fulfillment on the server. The public demo uses in-memory synthetic responses;
it never contacts a bank, stores a receipt, or accepts a payment.

The [Fastify example](../examples/fastify-checkout/README.md) documents backend
request and response shapes for hosts that want a concrete integration reference.
It is not deployed with the demo.

## Testing

From the repository root, use the pinned Vite+ and pnpm setup:

```sh
vp env install
pnpm install --frozen-lockfile
pnpm --filter @1hubengineering/receipt-verifier-checkout-web test
pnpm checkout:web
```

The full library suite (`pnpm verify`) also needs the test databases and Chromium.
See [development conventions](development/conventions.md) for commands and
[skills and MCP](development/skills-and-mcp.md) for optional editor setup.

## Deployment

Use the [live deployment guide](deployment.md) to choose a verification
runtime and check provider access from that environment.

Run `pnpm build:site` to build static HTML, CSS, and JavaScript from this guide
and the checkout example. GitHub Pages serves `examples/checkout-web/dist` via
the [Pages workflow](../.github/workflows/pages.yml). On a fork, enable Pages and
select **GitHub Actions** as the source. No credentials or backend services are
needed for this build.

Deploy a real verifier inside your backend with the matching database schema,
host-managed secrets, rate limits, monitoring, and reconciliation. Follow the
[worker operations guide](development/durable-jobs.md) and the provider's host
requirements. Deploying the static example does not deploy that backend.
