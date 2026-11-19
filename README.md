# Payment Verifier

Verify official Telebirr and CBE receipts against orders in your Node.js backend.
Payment Verifier checks the payment details and records an atomic claim in a shared store.
Your application owns fulfillment and other business effects.

The source checkout targets 0.2.0. The latest published version documented here is 0.1.1.
For the new input and response contract, see the [SDK guide](packages/verifier/README.md).

[Developer guide](https://1hubengineering.github.io/payment_verifier/docs/) ·
[API reference](https://1hubengineering.github.io/payment_verifier/api/) ·
[Interactive checkout demo](https://1hubengineering.github.io/payment_verifier/demo/) ·
[Release v0.1.1](https://github.com/1hubengineering/payment_verifier/releases/tag/v0.1.1)

## Install

```sh
npm install @1hubengineering/verifier@0.1.1
```

Run the [0.1.1 quickstart](https://1hubengineering.github.io/payment_verifier/docs/#quickstart)
to compare two synthetic records without a bank connection or database. To wire up
your application, choose [direct SQL, Drizzle, or Prisma](https://1hubengineering.github.io/payment_verifier/docs/#storage).
The [0.1.1 package migration](docs/development/npm-name-assessment.md#migration)
lists the shorter names and the upgrade from Drizzle `0.45.4` to the tested
`1.0.0-rc.5` peer.

## Agent tools

The [agent setup guide](docs/0.1.1/agents.md) covers the Payment Verifier skills
and a local MCP server for the current and archived docs.

## Examples

- [React checkout](examples/checkout-web/README.md): reusable UI and offline
  synthetic demo. Try a match, mismatch, or unavailable provider with retry.
- [Fastify checkout](examples/fastify-checkout/README.md): backend example with
  host-owned authentication and order lookup, scoped idempotency, and no live
  providers in the local demo.
- [Operator CLI](apps/cli/README.md) and [worker](apps/worker/README.md): private
  runnable packages for controlled verification and durable jobs.

## Develop

Install [Vite+](https://www.viteplus.dev/guide/) and run from the checkout root:

```sh
vp env install
pnpm install --frozen-lockfile
pnpm checkout:web
```

Use `/demo/` in the local dev server to try checkout. For the full suite, install
Chromium with `pnpm setup:browsers`, start the isolated SQL services with
`pnpm db:up`, run `pnpm verify`, then stop the services with `pnpm db:down`.
No live bank requests are required.

See the [documentation index](docs/README.md), [skills and MCP setup](docs/development/skills-and-mcp.md),
[development roadmap](docs/development/roadmap.md), and [third-party notices](THIRD_PARTY_NOTICES.md).
