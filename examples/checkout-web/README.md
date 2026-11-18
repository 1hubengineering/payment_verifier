# Reusable receipt checkout

This private React/TypeScript workspace example uses shadcn/ui primitives. It
does not call the SDK directly, take payments, or include backend credentials.

```sh
pnpm checkout:web
pnpm --filter @1hubengineering/receipt-verifier-checkout-web test
pnpm build:site
pnpm --filter @1hubengineering/receipt-verifier-checkout-web preview
```

Open `/demo/`. Use `DEMO-MATCH` for a match, `DEMO-MISMATCH` for a mismatch, or
`DEMO-RETRY` for unavailability on the first attempt per method followed by a
match on retry. Results are synthetic and reset on reload. Do not use real data.

## Integrate

Copy `src/checkout.tsx` and its shadcn primitives into a React app using the same
alias and design tokens, or adapt the styles to your system. Keep `src/main.tsx`
as a mock-only entry point. Compose `ReceiptCheckout` (or `OrderSummary` by
itself) with the exported types:

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

- `CheckoutProps` takes display-only order line labels and amounts, branding,
  method IDs and instructions, optional reference validation, and `receiptHelp`
  and `orderFooter` sections. Key it by your order context so changing orders
  clears prior feedback and aborts pending browser work.
- `ReceiptSubmission` passes only the trimmed reference, selected method ID,
  and an `AbortSignal`. The host callback authenticates, authorizes the order,
  validates the selected method against allowed methods, and submits the
  reference. Never trust UI amounts, order display data, or method selections as
  proof. Abort stops UI work; it cannot roll back a server commit.
- `ReceiptResult` has `matched`, `mismatch`, `unavailable`, and `rejected`
  outcomes. Map trusted server results to these states; preserve provider
  unavailability instead of calling it a mismatch. Rejected promises yield a
  generic retry state without showing host errors.
- Start idempotency in the host callback, not the shared component. Reuse a key
  for an uncertain transport retry of the same logical submission. If the host
  records an unavailable result as final, a deliberate new check after that
  result needs a new logical submission and its own key. Concurrent clicks in
  this component are suppressed; that does not replace server idempotency.

Receipt match never confirms settlement or authorizes delivery. Use separate
trusted host workflows for those decisions. The [Fastify example](../fastify-checkout/README.md)
shows one possible host contract. The browser example does not connect to it.

## Component provenance

The UI primitives come from the open-source [shadcn/ui registry](https://ui.shadcn.com/).
The reusable checkout composition is original. No Shadcnblocks Pro source or
derivative is included: the [license](https://www.shadcnblocks.com/license) and
[terms](https://www.shadcnblocks.com/terms) restrict redistribution as a reusable
example or template, separately from permission to ship an end product.
