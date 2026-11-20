This walkthrough uses the npm 0.3.0 public interfaces from a Node.js ESM backend.
The runnable example uses real SQLite and an injected offline provider. Follow
the live wiring below for official lookups on your own deployment.

## 1. Select and install packages

Use Node `^24.22.3` or `^26.13.1`. In a new working directory install the core,
one store adapter and its tested driver. For the local example run:

```sh
npm install --save-exact @1hubengineering/verifier@0.3.0 @1hubengineering/storage-sql@0.3.0 better-sqlite3@13.2.0
```

For PostgreSQL or MySQL, or an existing Drizzle or Prisma client, choose an
adapter from the [storage guide](storage.md). The database client runs in your
backend.

## 2. Configure a provider

For Telebirr use `import { retrieveTelebirr } from '@1hubengineering/verifier/providers'`
and set `providers: { telebirr: { retrieve: retrieveTelebirr } }`. For CBE
install `@1hubengineering/provider-cbe@0.3.0` and `playwright@1.65.1`, run
`npx playwright install chromium`, and set
`providers.cbe = createCbeProvider({ maxConcurrency: 1 })`, importing that
factory from `@1hubengineering/provider-cbe`. The built-in receipt lookup
adapters take no merchant API credentials. Your merchant must provide an
authorized receiving account and a way for the payer to enter the expected
receipt note if you require one. The backend needs provider egress and, for
CBE, the browser dependencies and OS sandbox. Use your app's configuration
system for paths, limits and credentials for infrastructure you operate.
[Telebirr](telebirr.md) · [CBE](cbe.md) · [Deployment](../deployment.md)

The example registers `telebirrFixture` in place of the live adapter. Use
synthetic locators only with fixtures. [Security and privacy](security.md)

## 3. Provision and initialize storage

Provision a fresh verifier store on your infrastructure. With local SQLite,
open a writable file with `new Database(path)` from `better-sqlite3`,
pass it to `sqliteStorage(database)` from `@1hubengineering/storage-sql/sqlite`,
and run `await storage.migrate()` explicitly. Pass the adapter and provider
map to `createReceiptVerifier({ storage, providers })`, then run
`await verifier.initialize()`. Keep the host connection open while serving
requests and close it on shutdown. Use the same claim store for all workers
handling the merchant's receipts. [Migrations and store ownership](storage.md)

## 4. Register the order and submit evidence

Authenticate the customer and authorize access to the requested order using
your host's existing authentication and data access. The server looks up the
tenant, order ID, configured provider, price, receiving account name and
suffix, merchant note and acceptance window. It passes that snapshot through
`createPaymentExpectation` and `verifier.registerExpectation`. Keep this
snapshot stable across retries. Capture the host invoice number in `reference`
only if that value belongs in the provider's receipt note.

The request body can contain the locator and a submission key. The server gets
`tenantId` and `paymentId` from the authorized order and calls
`verifier.submit({ tenantId, paymentId, idempotencyKey, receiptLocator })`.
Before the first request, preserve the original key and locator together, or
a secure reference to them, if recovery needs to survive page navigation or
a client restart. Use the host's authorized request tracking for a persistent
copy, limit sensitive data, and avoid storing a raw SMS when its canonical
identifier is sufficient. Apply admission and request-size limits before
accepting evidence.
[Evidence formats](evidence.md) · [Expectation fields](configuration.md)

## 5. Apply the committed result and recover safely

Branch on the returned status and handle rejected operation errors by code.
Leave the order pending on a timeout. Recover a dropped response with the
original evidence and key. Use a fresh key for a deliberate new observation only
when the known result and order state allow one. A duplicate claim calls for
merchant review. [Result and error handling](configuration.md) · [Recovery](retries.md)

Apply a committed `VERIFIED` result in a host transaction. In the example a
guarded order update and one fulfillment request commit together. The
fulfillment request has a unique order key. A worker delivering goods or
calling another service must also make that effect repeat-safe, for example
by passing a stable fulfillment key to a service that honors it. An SDK
commit and a separate host transaction can fail independently. The example
recovers the gap by replaying the original request. An application can also
consume the SDK outbox and acknowledge an event after its own commit. For
a shared transaction, use `prepare` and `complete` with the actual active
transaction. [Transactions and outbox](storage.md)

## Run the persistent synthetic checkout

Save [persistent-checkout.mjs](examples/persistent-checkout.mjs) with the installed
packages and pass it a new, empty directory.

```sh
node persistent-checkout.mjs "$(mktemp -d)"
```

The script checks timeout replay, a fresh observation, an amount mismatch,
invalid evidence, duplicate claims, bound-key conflicts and order authorization.
It simulates losing a successful response, processes the recovered result twice
and checks that only one fulfillment request exists. The scratch directory
contains `orders.sqlite` and `verifier.sqlite` for inspection. This command-line
walkthrough simulates an authenticated request and records only a fulfillment
intent. The [Fastify example](../../examples/fastify-checkout/README.md) shows
where to connect real host authentication and order callbacks.
