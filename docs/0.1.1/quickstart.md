Compare two synthetic records in Node.js. This example needs no database, provider credentials, or network access at runtime.

Use Node `24.22.3` or `26.13.1` in a new directory. Install the published core:

```sh
npm install @1hubengineering/verifier@0.1.1
```

Save [compare-receipt.mjs](https://github.com/1hubengineering/payment_verifier/blob/main/docs/0.1.1/examples/compare-receipt.mjs)
in that directory and run `node compare-receipt.mjs`.

<!-- runnable-example -->

Expected output: `MATCHED_RECEIPT_ONLY / UNCONFIRMED`. The comparison accepts supplied evidence. It does not authenticate the receipt, create a claim, or initiate a payment.

Next: [configure a verifier](#configuration) or [choose a storage adapter](#storage).
