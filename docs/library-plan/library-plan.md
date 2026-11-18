No problem—continuing from your **Better Auth example: yes, I recommend making this an installable TypeScript library that runs inside an application’s existing backend.**

A developer would add it to an e-commerce project, connect it to the project’s database, configure Telebirr and CBE, and expose the verification flow through their existing server. A hosted subscription service could later use the same core.

That makes the primary product **“payment verification you can add to your application.”**

## 1. What the Better Auth comparison means

Better Auth’s documented integration pattern is to install a package, create a configured server instance, connect storage, and mount a handler in the application. Its database tooling also supports generating the schema needed by the library. That is a useful model for the developer experience you want. [Better Auth](https://better-auth.com/docs/installation?utm_source=chatgpt.com)

For your library, the equivalent setup should be:

1. Install the package.
2. Configure the receiving accounts and supported providers.
3. Connect a supported database adapter.
4. Apply the library’s database migrations.
5. Connect the verification endpoints to the existing checkout.
6. Start a worker if the selected provider or deployment requires one.

The application would continue using its own users, products, orders, authentication, and interface.

For example, an existing shop could add these checkout choices:

- Pay by Telebirr transfer.
- Pay by CBE transfer.

When a customer selects one, the shop uses your library to prepare the payment instructions and verify the submitted receipt.

**The developer should not need to adopt a complete AndHub commerce platform to use this feature.**

## 2. What belongs to the application, and what belongs to the library?

I would draw the boundary like this:

| Responsibility | Owner |
|---|---|
| Users, login, and permissions | Existing application |
| Products, prices, discounts, and order totals | Existing application |
| Checkout appearance | Existing application, with optional UI helpers later |
| Payment expectation: amount, recipient, reference, and expiry | Created from trusted application data and stored through the integration |
| Retrieving supported provider receipt information | Verification library |
| Parsing and comparing receipt fields | Verification library |
| Recording verification attempts and outcomes | Verification library |
| Preventing conflicting receipt claims within shared storage | Verification library and its database adapter |
| Confirming incoming funds through a trusted merchant source | Separate settlement or reconciliation integration |
| Fulfilling an order or crediting a wallet | Existing application, after the required payment confirmation |

This keeps the package reusable.

Your Bingo application could connect it to a deposit request. An e-commerce application could connect it to an order. A rental application could connect it to an invoice. The verification core would not need to understand bingo boards, products, or rental contracts.

### One shared concept: a payment expectation

All those applications can provide essentially the same information:

> “For this payment request, expect this amount, in this currency, to this recipient, with this reference, within this permitted time window.”

The library then compares the retrieved evidence against those expectations.

The expected values must come from the backend. A customer should submit the receipt identifier or locator; they should not control the amount or recipient against which their receipt is checked.

## 3. How it would work inside an e-commerce checkout

Consider a customer buying an item for **500 ETB**.

### Step 1: The shop creates the order

The shop calculates the total on its server and creates the order.

The integration creates a payment expectation associated with that order, containing:

- The selected provider.
- The expected amount.
- The configured receiving account.
- A server-generated payment reference.
- The applicable payment window.

These details should be preserved as a payment snapshot. If the cart changes later, that should not silently change the expectations for a transfer already in progress.

### Step 2: The shop displays payment instructions

The customer sees the account details, amount, and reference to include in the supported payment note field.

The customer makes the transfer using the provider’s application or another supported payment channel.

For the current receipt-based scope, this step is a **manual transfer by the customer**. Directly initiating a transfer would require an additional provider integration.

### Step 3: The customer submits the receipt

The customer enters or pastes the supported transaction identifier or receipt link.

The existing backend checks that the customer can access the order, then passes the submission to the library.

### Step 4: The library checks the evidence

The library retrieves the supported provider receipt information, normalizes it, and compares the required fields.

Possible outcomes include:

| Outcome | Meaning |
|---|---|
| Pending | Verification is queued or still running. |
| Receipt matched | The required receipt fields match the stored expectation. |
| Mismatch | The retrieved information conflicts with the expectation. |
| Unable to verify | The provider is unavailable, required information is missing, or the format is unsupported. |
| Already claimed | The transaction is already associated with a conflicting payment request. |
| Needs review | The case requires an operator decision or additional evidence. |

A timeout should remain an availability problem. It should not tell a customer that their transfer failed.

### Step 5: The application completes its payment process

Here we need to preserve a distinction already established in your master plan: **matching a receipt, claiming that receipt locally, confirming settlement, and fulfilling an order are separate events.** The plan explicitly requires independently sourced settlement confirmation before wallet crediting or service delivery. ETHIOPIAN_PAYMENT_RECEIPT_VERIF…

The library should therefore expose precise results instead of returning an ambiguous `paid: true`.

For example:

```ts
{
  verificationStatus: "MATCHED_RECEIPT_ONLY",
  settlementStatus: "UNCONFIRMED",
  paymentRequestId: "payment_123",
  verificationId: "verification_456"
}
```

That gives an e-commerce integration a clear place to add merchant reconciliation or an authoritative provider confirmation later.

## 4. What the developer-facing API could look like

The following is an **illustrative API design**, not an existing published package:

```ts
import { createReceiptVerifier } from "@andhub/receipt-verifier";
import { postgresAdapter } from "@andhub/receipt-verifier/adapters/postgres";
import { telebirr } from "@andhub/receipt-verifier/providers/telebirr";

export const verifier = createReceiptVerifier({
  database: postgresAdapter(db),

  providers: [
    telebirr(),
  ],
});
```

Then, inside the application’s authenticated server route:

```ts
// Load and authorize the order using the application's own logic.
const order = await getOrderForCustomer({
  orderId: input.orderId,
  customerId: session.user.id,
});

// Resolve a stored payment expectation from trusted server data.
const payment = await getPaymentExpectation(order.id);

// Submit only the receipt evidence against that expectation.
const verification = await verifier.submit({
  paymentRequestId: payment.id,
  receiptLocator: input.receiptLocator,
  idempotencyKey: input.idempotencyKey,
});
```

The important developer experience is straightforward:

> Configure once, connect trusted order data, submit receipts, and read structured results.

We could also provide a route-handler adapter, but I would retain direct server methods. Some applications will prefer to call the library from their own routes, jobs, or administrative tools.

The saved plan currently records a CLI implementation with local SQLite claims. Converting that into this package interface would be a new development step. ETHIOPIAN_PAYMENT_RECEIPT_VERIF…

## 5. How deployment would actually work

**An embedded library does not inherently require a second server.** The simplest deployment would use the application’s existing Node.js backend and database.

There are three useful execution arrangements:

| Arrangement | What runs | When I would use it |
|---|---|---|
| Inside the application | Existing backend, library, and database | Supported lookups that comfortably fit the application’s request and hosting limits |
| Application plus worker | Existing backend, database, and a background worker | Slow lookups, retries, or browser-based retrieval |
| Central verification service | A separate API and workers used by several applications | Shared operations across multiple products or a future hosted offering |

The same package can support these arrangements without changing what a receipt match means.

### Why CBE needs special attention

Your saved plan records Telebirr retrieval through an HTTPS request and the current CBE retrieval approach through Playwright Chromium. It also records CBE timeouts and a temporary HTTP 502 during testing. Those are observations from the existing work, not guarantees about future provider behavior. ETHIOPIAN_PAYMENT_RECEIPT_VERIF…

For that reason, I would make the browser dependency part of a separate CBE execution component.

A Telebirr-only integration should not need to install or run Chromium.

A CBE integration using the current browser approach could run its worker:

- On the same VPS as the application.
- In a separate container.
- On a separate worker host when capacity or isolation requires it.

The application still imports the library locally. The worker handles the expensive retrieval work.

**Packaging the feature as a library makes integration simpler; the deployment still needs enough resources for the enabled providers.** We should initially support a clearly defined Node.js environment and validate other hosting environments individually.

## 6. Reuse the application’s database, with a strong adapter contract

I would avoid making every integration operate a second database just for verification.

Instead, the package should add a small set of tables to a supported database, such as:

| Table or entity | Purpose |
|---|---|
| Payment expectations | Preserve the amount, recipient, reference, and other matching requirements |
| Verification attempts | Record submissions, checks, and results |
| Transaction claims | Prevent conflicting use of the same provider transaction |
| Verification jobs | Persist background work and retries when enabled |
| Outbox events | Reliably communicate committed changes to other application processes |

The package could provide migrations and configurable table names.

However, **the quality of the transaction support matters more than supporting many ORMs immediately.**

For the first version, I would support one database integration properly, including:

- Concurrent submissions.
- Duplicate requests.
- Process crashes.
- Worker restarts.
- Transaction rollback.
- Repeated delivery of the same result.

Then expand to other adapters.

### The integration should survive a crash halfway through

A fragile implementation might:

1. Record a receipt claim.
2. Call an application callback.
3. Crash before the application records the result.

The receipt would appear consumed while the application still thought verification was unfinished.

The adapter contract should let related database changes commit together. External actions, such as emails or calls to another service, should use durable events and repeat-safe consumers.

OWASP’s payment-integration guidance similarly calls for server-side verification, matching expected payment details, and idempotent fulfillment so repeated callbacks do not repeat business effects. [GitHub](https://github.com/OWASP/CheatSheetSeries/blob/master/cheatsheets/Third_Party_Payment_Gateway_Integration_Cheat_Sheet.md?utm_source=chatgpt.com)

For your package, I would define repeat behavior explicitly:

- **Same submission, same payment request:** return the existing result.
- **Same transaction, different payment request:** return a claim conflict.
- **Temporary retrieval failure:** retain a retryable or reviewable outcome.
- **Matched receipt:** persist the evidence and claim consistently.
- **Later settlement confirmation:** apply the separate payment transition consistently.

A convenience callback such as `onReceiptMatched()` can be useful, but it should not be the only mechanism for delivering a financially meaningful state change.

## 7. One limit of independent installations: they cannot see one another

This matters if several AndHub applications receive payments into the same account.

Suppose:

- Your shop uses this library with Database A.
- Your rental platform uses it with Database B.
- Both receive payments into the same merchant account.

The library in Database A has no automatic knowledge of claims recorded in Database B.

**Installing the same package in both applications does not create a shared transaction registry.**

Strict recipient and order-reference matching helps, but it does not turn separate databases into coordinated storage.

For several applications sharing a payment destination, I would choose a deliberate arrangement:

| Situation | Appropriate design |
|---|---|
| One application | Claims stored in its own database |
| Several applications using one shared payment backend | Claims coordinated by that backend |
| Several applications with separate databases and shared receiving accounts | A shared claim authority or central verification service |
| Unrelated customers independently installing the package | Each installation has its own explicitly limited claim scope |

This is one reason a standalone service may become useful later, even if the library remains the primary product.

A central service can coordinate the applications connected to it. It still cannot promise universal receipt-reuse detection across systems it cannot observe.

## 8. How I would structure the project

I would organize it into a few clear modules rather than immediately publishing many packages.

### Core

Contains the provider-independent types, field normalization, matching rules, and outcome definitions.

The matching logic should run against fixtures without network access.

### Providers

Contains the Telebirr and CBE retrieval and parsing implementations.

Each provider reports both normalized evidence and retrieval errors. Missing fields or parser failures must remain explicit.

### Storage

Contains persistence, transaction claims, database migrations, and the transaction interface used by the host application.

### Execution

Supports direct execution and durable background work.

A database-backed queue may be sufficient for the initial worker design. Redis should become a requirement only if the selected implementation needs it.

### Integrations

Provides the developer conveniences:

- A plain Node.js API.
- One well-tested framework integration.
- An example checkout.
- Documentation for connecting existing orders and authentication.

For your stack, **a Fastify example would be a sensible first integration**. The core should remain independent of Fastify so another application can use it through different server routes.

Optional React components could follow once the backend contract is stable. The initial package can let developers use their existing checkout components.

## 9. Can it still become a subscription product?

Yes. **The packaging decision and the business model are separate decisions.**

You could eventually offer:

| Offering | What the customer receives |
|---|---|
| Self-hosted library | Code that runs inside their application |
| Commercial support | Integration assistance, maintained updates, and support |
| Managed verification API | AndHub operates the retrieval workers and verification infrastructure |
| Private deployment | A dedicated installation for a particular customer |

A future hosted API would wrap the same core library. A developer who wants direct installation uses the package; a developer who wants AndHub to operate the infrastructure uses the hosted API.

The commercial terms would need their own decision. There is no technical reason to make every library installation depend on an AndHub subscription server from the beginning.

## 10. The direction I would set now

I would revise the architectural priority to:

> **Build a TypeScript library for embedding Ethiopian receipt verification into existing applications. Use the host application’s backend, authentication, and supported database. Provide modular provider adapters, transactional receipt claims, precise verification outcomes, and optional durable workers. Keep a standalone API as an additional deployment of the same core.**

The first usable release should demonstrate one complete integration:

1. An existing application creates an order and payment expectation.
2. Its checkout displays the configured transfer instructions.
3. The customer submits a supported receipt.
4. The library verifies and records the evidence.
5. Duplicate submissions and concurrent claims behave consistently.
6. Provider failures remain recoverable.
7. Receipt matching stays distinct from settlement confirmation and fulfillment.

**I would make the next deliverable the reusable package plus a small e-commerce integration example.** That would prove the Better Auth-style experience you described while giving the future hosted service a reusable foundation.