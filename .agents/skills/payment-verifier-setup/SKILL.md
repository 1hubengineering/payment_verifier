---
name: payment-verifier-setup
description: Select a supported storage adapter and integrate the Payment Verifier TypeScript SDK into a Node.js backend. Use for first-time setup, provider choice, migrations, and host-owned transactions.
---

# Set up Payment Verifier

1. Check the installed package release and backend driver. For published 0.2.0,
   use the [0.2.0 quickstart](https://github.com/1hubengineering/payment_verifier/blob/main/docs/0.2.0/quickstart.md)
   and [versioned storage guide](https://github.com/1hubengineering/payment_verifier/blob/main/docs/0.2.0/storage.md).
   Initialize a fresh store for 0.2.0. Keep active 0.1.1 stores on their existing
   SDK until a tested cutover preserves receipt claims. Use archived guides for
   0.1.1 and the original 0.1.0 package names.
2. Keep the host's existing client. Use [direct SQL](https://1hubengineering.github.io/payment_verifier/docs/#direct-sql)
   for a driver pool, [Drizzle](https://1hubengineering.github.io/payment_verifier/docs/#drizzle)
   for Drizzle 1.0.0-rc.5, or [Prisma](https://1hubengineering.github.io/payment_verifier/docs/#prisma)
   for Prisma 7.10.1. Check the exact driver and engine; do not assume remote SQLite works.
3. Use one explicit migration owner and one shared claim store. Build the
   expectation from the authorized host order and pass only the authorized payment
   scope, receipt locator and idempotency key to the verifier.
4. Retrieve outside DB locks. To join host writes, prepare before the transaction
   and complete using the actual active transaction scope. The host owns commit
   and rollback. A local receipt match never settles or fulfills an order.

When the documentation MCP is available, use `search_docs` with the version and
follow with `get_doc`. Otherwise use the linked release reference, not a guessed
factory or subpath. Use synthetic evidence for tests.
