# Reusable receipt checkout

This private React/TypeScript example uses shadcn/ui. It shows how a CBE or
Telebirr transfer checkout can collect receipt evidence. The sample account
details do not accept money. The demo makes no provider requests.

```sh
pnpm checkout:web
pnpm --filter @1hubengineering/receipt-verifier-checkout-web test
pnpm build:site
pnpm --filter @1hubengineering/receipt-verifier-checkout-web preview
```

Open `/demo/`, choose CBE or Telebirr, and use the sample in any evidence tab.
Try `DEMO-MISMATCH` for a mismatch or `DEMO-RETRY` to see an unavailable result
followed by a simulated match on retry. `DEMO-MATCH` still works. Reload to reset
the demo. Do not enter a real receipt URL or SMS.

The example shares the SDK's pure ETB and locator checks. Its SMS parser supports
the two supplied message layouts, with redacted regression fixtures. It keeps
fees and taxes separate from the transfer amount and ignores account balances.
A message without enough information, such as a CBE SMS without a transfer
date, cannot match on SMS alone. The only positive results come from a known,
synthetic mock record. An in-memory index links accepted mock transactions to the
demo order and detects repeat submissions across tabs. Raw input is held only
in the form until reload or navigation. The demo has no durable evidence store
or manual review queue.

## Integrate

Copy `src/checkout.tsx`, `src/evidence-fields.tsx` and their shadcn primitives
into a React app using the same alias and design tokens, or adapt the styles.
The evidence UI imports only the `EvidenceKind` type from the demo parser; you
can keep that union without bringing the mock parser into your app. Compose
`ReceiptCheckout` (or use `OrderSummary` on its own):

```tsx
<ReceiptCheckout
  key={orderId}
  branding={{ name: 'Merchant', mark: 'M' }}
  order={orderDisplay}
  paymentMethods={methods}
  onSubmitReceipt={verifyViaHost}
  sections={{ receiptHelp: <p>Find the reference on your receipt.</p> }}
/>
```

- `CheckoutProps` takes display-only order values, branding, and method
  configuration. Methods can supply a logo, receiving details, instructions,
  and provider-specific placeholders. Set `evidence` to enable the three tabs;
  omit it to keep the reference-only form. Key the component by order so a
  new order clears drafts and aborts pending browser work.
- `ReceiptSubmission` passes the trimmed evidence as `reference`, the selected
  method ID, an `AbortSignal`, and an evidence `kind` when enabled. A real host
  must authenticate the caller, authorize the order, derive the expected values
  from that order and revalidate the provider and locator on the server. Keep
  raw SMS out of logs and browser storage. If retention is required, use
  access-controlled, encrypted server storage linked to the authorized order.
  Send only a validated locator to the SDK, never SMS-supplied amounts or status
  as trusted evidence. Abort cannot roll back a server commit.
- Return `matched` only after independent trusted verification. Other return
  states include `mismatch`, `unavailable`, `rejected`, `review`, and
  `duplicate`. Rejected promises show a generic retry message.
- Start idempotency in the host callback, not the shared component. Reuse a key
  for an uncertain transport retry of the same logical submission. If the host
  records an unavailable result as final, a deliberate new check after that
  result needs a new logical submission and its own key. Concurrent clicks in
  this component are suppressed; that does not replace server idempotency.

Receipt match never confirms settlement or authorizes delivery. Use separate
trusted host workflows for those decisions. The [Fastify example](../fastify-checkout/README.md)
shows a locator-only host contract. It does not accept SMS or connect to this demo.

## Component provenance

The UI primitives come from the open-source [shadcn/ui registry](https://ui.shadcn.com/).
The reusable checkout composition is original. No Shadcnblocks Pro source or
derivative is included: the [license](https://www.shadcnblocks.com/license) and
[terms](https://www.shadcnblocks.com/terms) restrict redistribution as a reusable
example or template, separately from permission to ship an end product.

Provider marks identify the available methods. They are not part of the
checkout's source license. See [third-party notices](../../THIRD_PARTY_NOTICES.md).
