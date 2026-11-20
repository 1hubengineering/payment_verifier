# Work with the repository examples

Use the [versioned SDK quickstart](0.3.0/quickstart.md) and
[persistent checkout](0.3.0/checkout.md) when integrating the published 0.3.0
packages. The [storage guide](0.3.0/storage.md) covers adapter selection,
verified claims and transactions. This page covers the workspace examples.

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

Run `pnpm build:site` to build static HTML, CSS, and JavaScript from the versioned
guides, published declarations and checkout example. GitHub Pages serves `examples/checkout-web/dist` via
the [Pages workflow](../.github/workflows/pages.yml). On a fork, enable Pages and
select **GitHub Actions** as the source. No credentials or backend services are
needed for this build.

Deploy a real verifier inside your backend with the matching database schema,
host-managed secrets, rate limits, monitoring, and reconciliation. Follow the
[worker operations guide](development/durable-jobs.md) and the provider's host
requirements. Deploying the static example does not deploy that backend.
