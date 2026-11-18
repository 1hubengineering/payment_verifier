# Optional CBE receipt browser

Version 0.1.1; locally tested with synthetic HTML and Playwright
1.65.1 / its matching Chromium. No live provider availability is claimed.

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
limits. Excess calls return `UNAVAILABLE/BUSY`; there is no in-memory queue.

The shared HTTPS transport retrieves only the exact official receipt URL, using
validated public IPv4 DNS results, TLS verification, no redirects and bounded
bytes/deadline. Chromium receives those bytes by intercepted route fulfillment.
All browser subresources and additional navigation are blocked, service workers
and downloads are disabled, and a sandbox CSP permits only inline rendering.
Chromium also has a nonworking local proxy, disabled DNS resolution and restricted
WebRTC; it cannot independently connect to the provider or arbitrary destinations.
The rendered DOM has a separate byte cap. Raw retrieval and rendering share one
time budget. Cancellation, timeout, missing browser installation or provider
failure remain unavailable, never a mismatch or payment success.

Supported evidence is the frozen CBE span layout, including recipient name and
account suffix, explicit successful status, A2A transfer type, reference, exact
ETB transferred amount and strict Ethiopian local timestamp. Pages requiring
external scripts or assets may remain unavailable; no unrestricted browser
fallback is provided. This is a deliberate supported-layout boundary pending
further synthetic format evidence.

Retrieved provenance includes the original HTML SHA-256, URL and retrieval time;
extraction still supplies receipt evidence only. The host must compare against
its immutable expectation. This package cannot claim, settle, credit or fulfill.

Chromium OS sandboxing is explicitly enabled, independently of the page's CSP.
The browser receives only LANG/TZ environment values, never inherited host
credentials. Its context uses en-US and Africa/Addis_Ababa so local receipt dates
remain Ethiopian time independent of the host timezone. Missing OS sandbox
support fails unavailable, with no no-sandbox fallback or public bypass option.
Run under an unprivileged, confined worker account with host-managed filesystem,
memory and process limits; the library does not provision containers or claim a
hard browser RSS quota. Restrict secret mounts/files separately. Linux tests
inspect actual child environment, renderer seccomp filters and PID namespaces,
then prove sandbox-launch failure releases capacity without unsafe retry.
