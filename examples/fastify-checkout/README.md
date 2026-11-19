# Fastify checkout

This private example wires Payment Verifier into a host's authentication, order lookup,
request admission, and fulfillment state. It accepts a receipt identifier, official URL,
or full SMS in one field. The SDK detects the input and verifies against the order's
server-owned expectation.

```sh
pnpm build
pnpm checkout
```

The loopback demo uses the public synthetic token `synthetic-customer-a` and serves
`synthetic-order`. It opens a disposable local SQLite file. Provider adapters are disabled
in this demo. The web demo uses separate synthetic fixtures.

```sh
curl -H 'Authorization: Bearer synthetic-customer-a' \
  http://127.0.0.1:3000/orders/synthetic-order

curl -H 'Authorization: Bearer synthetic-customer-a' \
  -H 'Idempotency-Key: synthetic-attempt-1' -H 'Content-Type: application/json' \
  -d '{"receiptLocator":"SYNTH1234"}' \
  http://127.0.0.1:3000/orders/synthetic-order/receipt-verifications
```

The authorized order response includes the selected provider, recipient name, optional
host-supplied account or wallet, amount, reference, and fulfillment state. The host
provides these values when constructing the order. The POST body accepts only
`receiptLocator`. Synchronous responses include `receipt: VerificationResult`.
Queued responses include `job: VerificationJob`, with 202 for pending jobs and a scoped
GET to poll the job. Invalid input returns 400 with typed feedback. Operation errors
serialize under `error`; conflict, capacity, and missing local records map to 409, 429,
and 404 respectively.

The example tests independent synthetic receipt retrieval, order ownership, provider
mismatch, canonical replay, duplicate claims, and provider timeout diagnostics. The host
owns customer messages and fulfillment.
