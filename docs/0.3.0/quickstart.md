Use the published ESM SDK with Node `^24.22.3` or `^26.13.1`. Start with the
offline example, then follow the persistent checkout in your Node backend.

## Offline learning example

In a new directory, install the core package.

```sh
npm install --save-exact @1hubengineering/verifier@0.3.0
```

Save [compare-receipt.mjs](examples/compare-receipt.mjs) and run
`node compare-receipt.mjs`.

<!-- runnable-example -->

Expect `MATCH`. This pure function compares supplied evidence, with no provider
connection, authenticity check, database, or receipt claim. A definite failed
check returns `MISMATCH`. Missing, invalid or ambiguous required evidence
without a definite failed check returns `INCOMPLETE`. The
`@1hubengineering/verifier/comparison` and `@1hubengineering/verifier/input`
subpaths also work in a browser.

## Complete persistent checkout

Follow the [checkout walkthrough](checkout.md) for package selection, provider
wiring, database migration, trusted expectations, verification and repeat-safe
application updates. Review [security and privacy](security.md) before exposing
a receipt submission endpoint. Use [recovery](retries.md) when a result is
inconclusive or the submission response is lost.
