# Payment Verifier

Verify Telebirr and Commercial Bank of Ethiopia (CBE) payments against orders
in your Node.js backend. Customers transfer funds directly to your designated
bank account or mobile-money wallet. Payment providers supply and operate the
accounts and wallets. The SDK starts at receipt submission and leaves funds
with the merchant and its provider.

Accept a transaction identifier, an official receipt link, or an SMS with a
supported identifier. The SDK retrieves the official receipt, checks it against
a trusted payment expectation, and returns a structured result. `VERIFIED`
means the configured receipt checks passed and the receipt was claimed in your
shared store. When you supply an outer transaction, that claim becomes durable
at its commit.

## Who Owns What?

Your application supplies the authenticated order, expected amount and recipient,
merchant reference, and validity window. It owns payment accounts, financial
records and ledger, order updates, and fulfillment. Your application owns and operates the
database. The SDK reads and writes the verification records required by its
documented workflow through your configured storage adapter.
[Application and storage responsibilities](docs/0.3.0/storage.md)

## Quick Start

Use **0.3.0** with Node `^24.22.3` or `^26.13.1`.

```sh
npm install --save-exact @1hubengineering/verifier@0.3.0
```

Run the [offline comparison](docs/0.3.0/quickstart.md), then follow the
[persistent checkout](docs/0.3.0/checkout.md) to configure a provider and
storage, verify a receipt, and apply the result once to an order.

## Verification Failures & Recovery

> An inconclusive verification does not prove that the customer failed to pay.
> A timeout alone must not trigger a request for another payment.

Recover an uncertain outcome with the original request and key.
[Recovery and customer communication](docs/0.3.0/retries.md) ·
[Results and operation errors](docs/0.3.0/configuration.md) ·
[Idempotency](docs/0.3.0/retries.md#idempotency) ·
[Troubleshooting](docs/0.3.0/troubleshooting.md)

## Documentation

[Common questions](docs/0.3.0/questions.md) ·
[Developer guide](https://1hubengineering.github.io/payment_verifier/docs/) ·
[API reference](https://1hubengineering.github.io/payment_verifier/api/) ·
[AI coding agent guide](docs/0.3.0/agents.md) ·
[Synthetic checkout](https://1hubengineering.github.io/payment_verifier/demo/)

Start new integrations with a fresh verifier store. Check the
[compatibility matrix](docs/development/compatibility.md) and
[upgrade guidance](docs/development/releases/0.3.0.md#upgrade-and-rollback)
before reusing an existing store.

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
All routine tests use synthetic evidence.

See the [documentation index](docs/README.md), [development roadmap](docs/development/roadmap.md),
and [third-party notices](THIRD_PARTY_NOTICES.md).
