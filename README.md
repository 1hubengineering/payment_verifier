# Payment Verifier

Embed Ethiopian payment receipt verification in your TypeScript backend. Compare
receipt evidence with a trusted order, record claims in a shared store, and keep
bank settlement and fulfillment under your application's control.

**A receipt match does not confirm settlement or authorize delivery.**

[Integration guide](https://1hubengineering.github.io/payment_verifier/) ·
[Interactive checkout demo](https://1hubengineering.github.io/payment_verifier/demo/) ·
[Release v0.1.0](https://github.com/1hubengineering/payment_verifier/releases/tag/v0.1.0)

## Install

```sh
npm install @1hubengineering/receipt-verifier@0.1.0
```

Start with the [core SDK quickstart](packages/receipt-verifier/README.md) and the
[integration guide](docs/guide.md). The core has no runtime dependencies or
implicit configuration. Choose a storage adapter and receipt provider explicitly.
Five npm packages are published at `0.1.0`; the source tree's Drizzle v1 RC changes
are not part of that release. Check the [compatibility matrix](docs/development/compatibility.md)
before selecting a driver or ORM version.

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
