# Embedded checkout example

Private Fastify **5.12.8** backend example. The factory embeds the SDK behind
host-owned authentication, orders, admission and independent settlement state.
It opens no connection or server and does not load environment configuration.
The runnable local demo owns its separate Varlock schema and SQLite handle.

For a browser UI, see the [React checkout](../checkout-web/README.md). Its public
demo uses local mocks and is not connected to this server.

```sh
pnpm checkout
```

The demo binds **127.0.0.1** on CHECKOUT_PORT (default 3000), uses the public
synthetic bearer token `synthetic-customer-a`, and serves `synthetic-order` for
that customer. Its in-memory order/session and fixed 20-per-minute global
admission policy are local synthetic examples, not production authentication or
multi-process rate limiting. Existing applications supply their own callbacks.
There are **no configured providers**: submitted receipts remain unverified, with
no bank requests or claims. The SQLite default is the ignored workspace file
`.receipt-checkout-demo.sqlite`; CHECKOUT_DATABASE_FILE can select an absolute path.
Restarting the demo preserves SDK records, but its synthetic host data is fixed.

```sh
curl -H 'Authorization: Bearer synthetic-customer-a' \
  http://127.0.0.1:3000/orders/synthetic-order

curl -H 'Authorization: Bearer synthetic-customer-a' \
  -H 'Idempotency-Key: synthetic-attempt-1' -H 'Content-Type: application/json' \
  -d '{"receiptLocator":"SYNTH1234"}' \
  http://127.0.0.1:3000/orders/synthetic-order/receipt-verifications
```

The factory's host services provide:

- `authenticate(request)`: a trusted tenant/user from the host's existing session.
- `admit(principal)`: the host's admission/rate policy before order lookup.
- `findOrder(tenantId, orderId)`: trusted order ownership and immutable expectation.
- `readOrderState(order)`: independently stored settlement and fulfillment state.
- `verifier`: an explicitly configured SDK instance using the host's storage/providers.
- Optional `jobs`: durable admission/status using that same store and expectations.

Every order and job lookup checks both trusted tenant and owner before provider
work. The POST body accepts only receiptLocator; the Idempotency-Key header is
mandatory. Amounts, recipient accounts, provider and identity never come from
submitted bodies. Custom AJV settings reject additional fields rather than strip
them, and disable coercion. The handler idempotently registers the trusted order
snapshot; a later changed host snapshot is refused instead of replacing it.
The body limit is 8192 bytes and locator length is 4096 characters. A configured
1–4 in-flight permit bound protects provider work; exhaustion returns 429 with a
retry hint. The host still owns deployment limits and distributed rate controls.

Synchronous POST responses contain `receipt`, including safe checks and settlement
UNCONFIRMED. Conflicting idempotency reuse returns 409. A supplied durable queue
returns 202 only after its acceptance transaction commits, containing `job` and
its ID. GET `/orders/:orderId/receipt-verifications/:jobId` requires that same host
order ownership and the job's tenant/payment scope. Queue capacity returns 429;
provider/parser failures stay unverified. Generic errors omit submitted content,
URLs, credentials, driver details and internal stack traces.

GET `/orders/:orderId` reads host settlement/fulfillment separately. Receipt
completion never updates those states or invokes delivery/credit. A matched
receipt can coexist with UNCONFIRMED settlement and PENDING fulfillment; a trusted
settlement integration may later change the host record independently. No route
in this example confirms settlement or authorizes fulfillment. App closure also
does not close host-supplied SDK connections; the demo closes only its own handle.

Sixteen Fastify.inject cases use actual SQLite and synthetic provider evidence.
They cover owner/tenant denial, authoritative field rejection, byte bounds,
matching without settlement/fulfillment, exact replay and conflicts, global receipt
reuse, immutable snapshots, unavailable providers, in-flight/admission limits,
safe errors, durable 202 capacity and scoped polling. The SDK's nine-cell matrix
independently proves its advertised SQL/ORM integrations. A seventeenth case runs the actual Varlock demo over loopback and proves clean
SIGTERM shutdown with no claim. No live provider,
production authentication, settlement integration or public deployment is claimed.
