Compare a synthetic Telebirr receipt against a trusted order in Node.js. This
example runs offline without a database.

Use Node `24.22.3` or `26.13.1` in a new directory and install the published SDK.

```sh
npm install @1hubengineering/verifier@0.2.0
```

Save [compare-receipt.mjs](https://github.com/1hubengineering/payment_verifier/blob/main/docs/0.2.0/examples/compare-receipt.mjs)
and run `node compare-receipt.mjs`.

<!-- runnable-example -->

The example prints `MATCH`. It performs a pure comparison of supplied evidence.
For official retrieval and an atomic claim, [configure a server verifier](#configuration)
and [initialize a fresh verifier store](#storage).
