Import `retrieveTelebirr` from `@1hubengineering/verifier/providers` and register
`providers: { telebirr: { retrieve: retrieveTelebirr } }` on the server.
The SDK detects a supported transaction reference, official URL, or SMS and
constructs the bounded HTTPS lookup inside the provider transport.

An unexplained HTTP 404 returns `UNAVAILABLE` with code `PROVIDER_HTTP_ERROR`.
Use `parseReceiptHtml` with saved synthetic HTML for extraction diagnostics.
Receipt claims use the configured retrieval and store. Published provider
validation uses synthetic receipts and local transport mocks.

Use **Customer Note** as the host-owned expected reference. The invoice number
and provider transaction ID are separate. Where Telebirr connectivity requires a
host-managed SSH tunnel, pass its private Unix socket as `telebirrTunnelSocket`
in the provider retrieval options.
