Keep the expected payment on the server. Before accepting or looking up a
submission or job, authenticate the caller and authorize the tenant and
order. Derive the amount, recipient, currency, provider, note and payment
window from trusted records. Accept a bounded locator and a submission key
from the customer. Browser recognition is feedback only.
[Evidence formats](evidence.md) · [Checkout example](checkout.md)

## Receipt source and outbound access

The SDK rebuilds a fixed official HTTPS locator from a validated identifier
and enforces the registered provider. The built-in Node transport restricts
direct DNS answers to public IPv4, checks resolved destinations and the TLS
hostname, and refuses redirects and compressed or unexpected responses.
These controls protect built-in retrieval against server-side request forgery
(SSRF).
The optional host-configured Telebirr Unix socket makes the host responsible
for providing that trusted route. TLS verification still applies. Preserve
egress restrictions and protect the socket. CBE uses a sandboxed browser with
a restricted environment and blocks arbitrary browser network requests.
Current layout retrieval permits only the provider's scoped data requests.
[CBE setup](cbe.md) · [Deployment](../deployment.md)

Set deadlines, byte limits and host admission bounds. Run CBE as an
unprivileged user with its Chromium sandbox and OS confinement for filesystem,
CPU, memory and processes. Keep unrelated credentials and files out of the
worker. The SDK fails closed when evidence is incomplete or unsupported.
A custom provider is part of your trusted backend and must enforce its own
transport and authenticity rules. An adapter that fabricates provenance can
make supplied fixtures look like observed evidence to the verifier.

Verified TLS connects to the official hostname. The stored content hash
identifies the response observed during lookup. It is not a provider signature
or evidence of irreversible funds. Account matching is limited to name and
suffix, and the receipt describes a point-in-time result. Apply your own
reconciliation or release-of-goods policies as appropriate.
[Result guarantees](configuration.md)

## Data and business effects

Give backend processes least-privilege access to the shared verifier store.
Protect database backups, provider routing, and job encryption secrets via
the host's configuration system. Keep secrets out of the browser and
source control. Only durable-job input is explicitly encrypted by the SDK.
Review the [storage inventory](storage.md) for persisted identifiers and
receipt fields. Set access and retention policy without deleting keys or
claims needed for duplicate protection and replay.

Return a minimal customer response. Log structured codes, stage and internal
correlation IDs. Redact SMS, receipt URLs, receipt and account identifiers,
notes, idempotency keys and sensitive diagnostics from routine logs. Use
sanitized fixtures for parser debugging. Saved receipt HTML is sensitive
and should be access-controlled and time-limited if merchant-approved
diagnostics require it.

Update orders after the applicable verification commit. Use repeat-safe
host transactions and stable fulfillment keys. Keep auth, access checks,
updates, notifications and developer diagnostics in the backend.
[Recovery and messaging](retries.md) · [AI integration checklist](agents.md)
