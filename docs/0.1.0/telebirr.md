Telebirr retrieval is included in the core's provider subpath. You do not need a separate Telebirr package.

For `@1hubengineering/receipt-verifier@0.1.0`, import `retrieveTelebirr` from `@1hubengineering/receipt-verifier/providers` and configure `providers: { telebirr: { retrieve: retrieveTelebirr } }`.

Retrieval accepts supported locators and uses bounded HTTPS to the configured official host rules. Unavailable responses are not matches. `parseReceiptHtml` can inspect saved HTML for tests or diagnostics, but saved HTML is not eligible for a claim.

See [supported layouts and transport limits](https://github.com/1hubengineering/payment_verifier/blob/v0.1.0/packages/receipt-verifier/README.md#provider-evidence-subpath). The project tests synthetic HTML; it does not promise live provider compatibility or permission.
