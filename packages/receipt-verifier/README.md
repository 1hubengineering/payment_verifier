# @1hubengineering/receipt-verifier

Version 0.1.0. Exact ETB parsing, trusted expectation snapshots,
pure receipt comparison, provider evidence and an atomic verification workflow are implemented.
Storage is configured through separately tested adapters.

```ts
import {
  parseEtbAmount,
  createPaymentExpectation,
  compareReceipt,
} from '@1hubengineering/receipt-verifier';

// Load these values from authorized host records, never receipt submissions.
const expectation = createPaymentExpectation({
  tenantId: 'synthetic-merchant',
  paymentId: 'synthetic-payment',
  provider: 'telebirr',
  currency: 'ETB',
  amountMinor: parseEtbAmount('500.00'),
  recipientName: 'Synthetic Merchant',
  recipientAccountLast4: '1234',
  reference: 'ORDER_1234',
  validFrom: 1700000000000,
  validUntil: 1700000060000,
});

const result = compareReceipt(expectation, {
  provider: 'telebirr',
  currency: 'ETB',
  transactionId: 'SYNTH1234',
  status: 'SUCCESSFUL',
  amountMinor: parseEtbAmount('500.00'),
  recipientName: 'Synthetic Merchant',
  recipientAccountLast4: '1234',
  reference: 'ORDER_1234',
  transactionAt: 1700000030000,
  paymentType: null,
  ambiguousFields: [],
});
// result.verificationStatus === 'MATCHED_RECEIPT_ONLY'
// result.settlementStatus === 'UNCONFIRMED'
```

The host owns authentication and payment authorization. Expectation construction
validates and freezes a copy; comparison revalidates even untyped input. Only
canonical decimal ETB text is parsed: positive, at most two decimals, within safe
integer minor units. No rounding, separators, symbols or whitespace.

Time bounds and evidence timestamps are integer epoch milliseconds, inclusive at
both endpoints. Provider extraction must validate original dates/timezones before
normalizing them. There is no ambient clock, timezone assumption, or expiry of a
submission based on when comparison runs. The future storage workflow must recheck
payment state separately before accepting a claim.

Names normalize whitespace and case; suffixes and references compare exactly.
A four-digit suffix does not prove full receiving-account identity. The transaction
ID must be normalized uppercase ASCII, 6–40 characters including `_` or `-`.
CBE requires payment type `A2A`. Every provider requires successful status, exact
amount and currency, recipient, reference, transaction ID and timestamp.

Parsers must list contradictory fields in `ambiguousFields`; malformed ambiguity
metadata fails closed. Missing, invalid or ambiguous required evidence returns
`UNABLE_TO_VERIFY`, including when another field mismatches. Complete conflicting
evidence returns `MISMATCHED`. Results include per-field checks without echoing
sensitive values. `paymentType` is checked only for CBE.

This pure API compares supplied evidence and cannot establish authenticity. Saved
HTML or fabricated normalized fields can match. Matching never claims a transaction,
confirms settlement, credits a wallet, or authorizes fulfillment. There is no public
unchecked claim API.

The core has no runtime dependencies and performs no import-time I/O. ESM only.
Supported runtime ranges are `^24.22.3 || ^26.13.1`; CI is configured for both
minimums. Development uses Node 26 LTS. Direct SQL, Drizzle and Prisma 7 integrations each pass the same real-engine
contract on PostgreSQL, MySQL and SQLite; see the adapters for exact versions.

## Provider evidence subpath

`@1hubengineering/receipt-verifier/providers` exports `parseReceiptHtml`,
`normalizeReceiptLocator`, and `retrieveTelebirr`. The root import loads no transport or browser code. Parsing saved HTML returns `SAVED_HTML` provenance and cannot prove
authenticity. `retrieveTelebirr` returns `EVIDENCE` with `OFFICIAL_HTTPS` provenance
(URL, time, original HTML SHA-256, parser version), or `UNAVAILABLE` with a generic
error code. Never interpret `EVIDENCE` as a match without comparison.

Supported synthetic Telebirr formats are label/value table rows, bilingual rows,
span pairs and the v5 invoice header/value table. Conflicting duplicates fail
closed; invoice headings never become values and fees never become transferred
amounts. Missing timestamps remain missing. Supported local date forms use
UTC+03:00 with strict calendar validation; explicit ISO timezone offsets are
validated separately. No live provider behavior has been tested.

HTTPS retrieval checks official scheme/host/path before work, rejects credentials,
ports, queries, fragments, unrelated links and conflicting IDs. DNS is checked
inside socket lookup, the selected public IPv4 address is used for that socket,
and each request owns a fresh agent. IPv6 is deliberately unsupported. Private,
loopback, link-local, documentation, multicast and reserved IPv4 ranges are blocked;
mixed public/private answers fail closed. TLS remains verified. There are no
redirects, proxies, ambient configuration or decompression; HTML headers, UTF-8,
16 KiB response headers, a 2 MB maximum body and 1–60000 ms total deadline are
bounded. Retrieval accepts an abort signal. Timeouts remain unavailable.

CBE extraction is also available through `parseReceiptHtml('cbe', html)`; actual
browser execution belongs to the optional CBE package. Neither provider performs
storage writes or authorizes settlement or fulfillment. The configured verifier
workflow records atomic receipt-only claims through a separately supplied storage adapter.

## Configured verifier

`createReceiptVerifier({ storage, providers })` adds `registerExpectation`,
`prepare`, `complete` and `submit`. Hosts authorize tenant/payment access and pass
expectations from trusted records. Submissions supply a locator and idempotency
key only. `prepare` retrieves outside transactions and returns an opaque in-process
token; `complete` rechecks current immutable expectations/state and performs atomic
storage work. `submit` combines those steps. A caller-owned transaction may complete
a previously prepared token but cannot prepare provider work inside that transaction.
The SQL package documents connection ownership, replay, migrations and durable events.
No receipt-only result authorizes settlement, credit or fulfillment.

HTML extraction accepts explicit, balanced row/cell/span layouts. The scanner
advances monotonically through at most 2 MB, 8192 structural tokens, 4096
characters per tag, 128 cells per row and 8192 characters per field. Unsupported
or malformed structures throw a generic error; retrieved parser failures become
provider unavailability. Scripts/comments and raw-text content do not supply
evidence. Entities decode once and escaped markup remains text. These limits
are conservative compatibility boundaries, not browser-style HTML repair.

## Optional durable work

The `/jobs` entry supplies `createDurableVerifier` using the same configured
store and trusted providers. Acceptance persists encrypted locators and bounded
idempotency aliases before acknowledgment. Persisted leases, fenced completion,
bounded retries/backoff/provider pauses and explicit retention survive process
restarts. Completion joins the same atomic claim/evidence/result/outbox transaction.
Every advertised storage cell runs the shared durable-job and SIGKILL recovery
cases. See [durable job configuration](https://github.com/1hubengineering/payment_verifier/blob/main/docs/development/durable-jobs.md) for
policy bounds, key handling, ownership and operational requirements. All outcomes
retain settlement UNCONFIRMED; jobs never authorize fulfillment.

Persisted attempt evidence contains only allowlisted bounded primitive fields and
valid ambiguity names. Extra/raw plugin properties and nested invalid values are
never stored. Comparison checks still report malformed evidence as INVALID and
unverified; storage sanitization does not turn missing data into a match.
