Install `@1hubengineering/provider-cbe@0.2.0` with `playwright@1.65.1` and its
matching Chromium. Use `npx playwright install chromium` to install the browser.
On the server, pass a `createCbeProvider({ maxConcurrency: 1 })` instance as
`providers.cbe` and apply host admission and resource bounds.

The SDK uses bounded HTTPS retrieval and renders the supported receipt layout in
sandboxed Chromium. Use an unprivileged worker with a working OS sandbox.
Admission exhaustion returns `PROVIDER_BUSY` and a renderer deadline returns
`RECEIPT_RENDER_TIMEOUT`, both with status `UNAVAILABLE`. Browser launch
exceptions can reject the operation with `INTERNAL_ERROR` in the published
tarball. Check the matching browser install and sandbox when that occurs.

This release checks the supported receipt fields, including an official
transaction ID, A2A payment, and the Ethiopian local timestamp.
See the [version-pinned CBE source](https://github.com/1hubengineering/payment_verifier/tree/a876f119fa0da2670b7b2312698cbd538f676b9a/packages/provider-cbe).
