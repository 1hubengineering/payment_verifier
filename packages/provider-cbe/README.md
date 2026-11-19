# CBE receipt adapter

Version 0.3.0. Current CBE receipt pages load transaction data from
CBE's public JSON service. The adapter uses Playwright 1.65.1 and its matching
Chromium for current and older receipt layouts.

```ts
import { createCbeProvider } from '@1hubengineering/provider-cbe';
const cbe = createCbeProvider({ maxConcurrency: 1 });
// Call from an authenticated host route or durable worker, outside DB locks.
const result = await cbe.retrieve('https://mbreciept.cbe.com.et/v2-SYNTHETIC', {
  timeoutMs: 15000,
  maxBytes: 2000000,
});
```

Install the explicit Playwright peer and its Chromium with `playwright install
chromium` (CI uses `--with-deps`). Importing the package starts no browser. Each
accepted call owns and closes its browser; admission is per provider instance,
bounded to 1–4 active calls. Create one instance per worker and apply host admission
limits. Excess calls return `UNAVAILABLE` with code `PROVIDER_BUSY`.

The adapter starts at the official, validated receipt URL. For the current
client-rendered receipt layout, a fresh sandboxed browser requests the fixed
CBE JSON URL from the official receipt page origin. The browser omits
credentials, uses normal CORS and verifies TLS. The adapter pins a validated
public IPv4 result for the data host, permits only the exact data GET and its
CORS preflight, and blocks provider page scripts, redirects and extra assets.
Receipt HTML and decoded JSON share the configured byte and time budget.

For older inline receipts, Chromium receives the HTML by intercepted route fulfillment.
All browser subresources and additional navigation are blocked, service workers
and downloads are disabled, and a sandbox CSP permits only inline rendering.
Chromium also has a nonworking local proxy, disabled DNS resolution and restricted
WebRTC; it cannot independently connect to the provider or arbitrary destinations.
The rendered DOM has a separate byte cap. Raw retrieval and rendering share one
time budget. Caller cancellation rejects with `OPERATION_CANCELLED`. Renderer
timeouts return retryable `UNAVAILABLE` with code `RECEIPT_RENDER_TIMEOUT`.

The JSON path uses the credited amount and currency, bank transaction ID,
credited recipient, transfer type, status, transaction timestamp, and payment
description or note. Missing, invalid, or contradictory values remain
unverified through SDK comparison. The older span layout uses the same
comparison contract. Retrieved provenance includes the official receipt URL,
retrieval time, and SHA-256 of the source body used for evidence. The host
compares evidence against its own immutable expectation and owns settlement
and fulfillment.

Chromium OS sandboxing is explicitly enabled, independently of the page's CSP.
The browser receives only LANG/TZ environment values, never inherited host
credentials. Its context uses en-US and Africa/Addis_Ababa so local receipt dates
remain Ethiopian time independent of the host timezone. Missing OS sandbox
support or a missing Chromium installation returns `UNAVAILABLE` with code
`RECEIPT_BROWSER_UNAVAILABLE` at `receipt_rendering`. Restore the browser runtime
or sandbox before starting a fresh attempt. Browser exception text stays private.
Run under an unprivileged, confined worker account with host-managed filesystem,
memory and process limits; the library does not provision containers or claim a
hard browser RSS quota. Restrict secret mounts/files separately. Linux tests
inspect actual child environment, renderer seccomp filters and PID namespaces,
then prove sandbox-launch failure releases capacity without unsafe retry.
