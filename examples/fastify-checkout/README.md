# Embedded checkout example

This private example uses Fastify **5.12.8** and Payment Verifier **0.1.1**.
`createCheckoutApp` accepts the host's authentication, order lookup, rate policy,
and verifier. The runnable local demo manages its Varlock schema and SQLite handle.

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
  -d '{"kind":"transaction","reference":"SYNTH1234"}' \
  http://127.0.0.1:3000/orders/synthetic-order/receipt-verifications
```

## Staging integration

Configure `createCheckoutApp` with your staging session and order store. Use a
verifier with synthetic provider fixtures to test independently fetched receipt
data against the order.

- `authenticate(request)` returns the tenant and customer from the host's session.
- `admit(principal)` applies the host's admission policy before order lookup.
- `findOrder(tenantId, orderId)` returns the owner and the server's payment
  expectation, including provider, amount, recipient name and account suffix,
  order reference, and validity window.
- `readOrderState(order)` reads settlement and fulfillment from the host's records.
- `verifier` uses the host's storage and provider configuration.
- Optional `jobs` uses the same store and expectations for durable verification.

The order and job routes require the customer's session and check tenant and
owner before working with payment evidence. `GET /orders/:orderId` returns the
order's provider, amount in ETB minor units, and its settlement and fulfillment
states. The recipient fields stay in the server's payment expectation.

Send `POST /orders/:orderId/receipt-verifications` with an `Idempotency-Key`
header and `{"kind":"transaction","reference":"SYNTH1234"}`, or use `url` or
`sms` for `kind`. The React checkout callback can send its `kind` and
`reference` directly. The original `{"receiptLocator":"SYNTH1234"}` body
also works. The endpoint rejects additional properties and checks the evidence
against the order's provider. It sends the normalized locator to the verifier.
SMS amounts and recipients are ignored, and the raw SMS is discarded.

If a CBE number or SMS supplies no usable receipt link, the typed request returns
`422 CBE_RECEIPT_URL_REQUIRED`. Ask the customer to paste the official CBE
receipt link in the Receipt URL tab. They can reuse the same idempotency key
because the endpoint has yet to create an attempt. A malformed or wrong-provider
URL submitted in the Receipt URL tab returns `400 INVALID_EVIDENCE`.

The handler registers the trusted order snapshot and refuses later changes to
that expectation. The body limit is 8192 bytes and the evidence limit is 4096
characters. The factory allows 1–4 concurrent verifications. At capacity, it
returns 429 with `Retry-After`. The host manages deployment limits and distributed
rate controls.

Synchronous POST responses contain `receipt`, including safe checks and settlement
`UNCONFIRMED`. Reuse the key after a lost response. The same order, key, and
normalized locator replay the result, even if the evidence was submitted in a
different format. Conflicting key reuse returns 409. A provider timeout returns
`UNABLE_TO_VERIFY` without a claim. For a deliberate recheck after that outcome,
send a new key. The verifier rejects receipts already claimed by another payment.
A supplied durable queue returns 202 after its acceptance transaction commits.
Poll `GET /orders/:orderId/receipt-verifications/:jobId` with the same authenticated
order access. Generic errors omit submitted content, credentials, and stack traces.

`MATCHED_RECEIPT_ONLY` means the independently retrieved details agree with the
order. Settlement and fulfillment remain under host control. The host also
closes its SDK connections when it shuts down.

## Tests

```sh
pnpm exec vp test run examples/fastify-checkout
```

The suite exercises both providers using synthetic receipts and SQLite. It covers
cross-customer access, provider timeouts, replay and duplicate claims, and
settlement and fulfillment after a receipt match. A loopback test starts the
Varlock demo, submits a typed request, and checks clean SIGTERM shutdown.
