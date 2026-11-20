Install `@1hubengineering/provider-cbe@0.3.0` with `playwright@1.65.1` and its
matching Chromium. Use `npx playwright install chromium` to install the browser.
On the server, pass `createCbeProvider({ maxConcurrency: 1 })` as
`providers.cbe` and apply host admission and resource bounds.

The adapter supports legacy receipt HTML and data-backed receipts. Older layouts
render offline in sandboxed Chromium. Current layouts use the bounded provider
data path, with a browser fallback scoped to the official data endpoint. Run the
worker unprivileged, with OS sandboxing and host resource confinement.

Admission exhaustion returns `PROVIDER_BUSY`, and a renderer deadline returns
`RECEIPT_RENDER_TIMEOUT`. Chromium startup problems return
`RECEIPT_BROWSER_UNAVAILABLE`. Use `checkCbeBrowser()` to test the browser sandbox
with a local fixture. Run `checkProviderConnectivity('cbe')` from
`@1hubengineering/verifier/providers` when you intend to check TLS to the CBE hosts.

Use the receipt's **Reason / Type of service** as the expected note. The provider
also verifies the official transaction ID, A2A payment and transaction time.
See the [CBE provider source](https://github.com/1hubengineering/payment_verifier/tree/v0.3.0/packages/provider-cbe).

[Evidence formats](evidence.md) · [Deployment](../deployment.md) · [Security and privacy](security.md)
