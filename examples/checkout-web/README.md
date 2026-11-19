# Checkout web example

Run `pnpm build` and `pnpm checkout:web` from the workspace root, then open `/demo/`.
Choose CBE or Telebirr and use the sample SMS, a synthetic receipt URL, or a synthetic
transaction number in the same field. The demo uses fixtures and keeps claims in memory
until reload. Enter only synthetic data.

The demo accepts `DEMORETRY` for Telebirr or `v2-DEMORETRY` for CBE to simulate a
retryable provider failure followed by verification. Use `DEMOMISMATCH` or
`v2-DEMOMISMATCH` to simulate a mismatch.

Pass host-owned branding, order lines, and payment instructions to `ReceiptCheckout`.
Its `onSubmitReceipt` receives the selected method, raw reference, and an abort signal.
Call your authorized backend there and return the result status and retry flag used
by the component. Use the optional validation hook with the browser-safe
`@1hubengineering/verifier/input` parser for format feedback. The backend validates
again and supplies the trusted provider and order expectation.
