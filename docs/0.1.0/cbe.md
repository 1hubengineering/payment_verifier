CBE retrieval uses a sandboxed Chromium worker. Deploy it only where the host can confine the browser process.

Install `@1hubengineering/receipt-verifier-provider-cbe@0.1.0` and `playwright@1.65.1`. Install the matching Chromium with `npx playwright install chromium`. Create one `createCbeProvider({ maxConcurrency: 1 })` instance per worker and pass it as `providers.cbe`. Apply admission and resource bounds in your host.

Missing Chromium, unavailable sandboxing, unsupported layouts and timeouts fail unavailable. Do not disable the sandbox or let Chromium fetch arbitrary provider subresources. See the [CBE worker requirements](https://github.com/1hubengineering/payment_verifier/blob/v0.1.0/packages/receipt-verifier-provider-cbe/README.md).
