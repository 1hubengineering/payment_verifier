# Provider evidence and bounded retrieval

## Outcome and scope

Slice 2 ports synthetic Telebirr v5 extraction behavior into the new evidence
contract and adds bounded official HTTPS retrieval. CBE parsing and optional
browser execution remain separate from the root core entrypoint. Evidence
provenance distinguishes saved HTML from retrieved content; neither implies
settlement. No live bank requests are part of development.

## Evidence

The frozen fixtures cover Telebirr bilingual pairs, div/span pairs, invoice
header/value rows and CBE label/value spans. The simplest Telebirr fixture has no
timestamp and must remain unable to verify against time-bounded expectations.
Legacy extraction selected the first value and rounded numbers; the port must
reject duplicate conflicting values and preserve exact decimal text.

Node HTTPS supports a custom lookup callback and agent isolation. A URL allowlist
alone cannot prevent DNS rebinding. Playwright routing can abort requests but
browser DNS must not become a second unvalidated network path.

## Steps

- [x] Add strict bounded HTML/date/amount extraction with contradiction tracking.
- [x] Add official locator normalization and provenance, keeping saved HTML explicit.
- [x] Add HTTPS retrieval with connect-time destination policy, no redirects,
      no proxy/environment loading, byte and wall-clock limits, and generic errors.
- [x] Add separate optional CBE browser execution with all traffic mediated by
      the bounded HTTPS transport, bounded concurrency and cleanup.
- [x] Add offline regression/security tests and installed subpath checks.
- [x] Run `pnpm verify`, review code-review.md, update roadmap and commit.

## Validation

Synthetic fixture matches must reproduce required fields without invoice header
confusion or fee amounts. Unknown ID, missing time, duplicate contradictory fields,
invalid calendar dates and unsupported markup cannot match. Local mocks test
private/mixed DNS, rebinding, redirect, TLS/HTTP failure, compressed/unexpected
content, deadlines, cancellation and streamed size caps. Browser tests must cover
blocked subresources/popups/service workers, timeout, size and concurrency limits.
No hosted provider availability or settlement capability is claimed.

## Decisions

- Use core provider subpaths for dependency-free extraction and Node HTTPS;
  root import remains provider-neutral with no runtime dependencies or I/O.
- Provider timestamps without a zone in the supported Ethiopian layouts mean
  UTC+03:00, validated by calendar roundtrip before conversion.
- Only supported layouts are extracted. Unsupported formats fail closed rather
  than searching arbitrary text for plausible successful fields.
- Optional CBE Chromium work belongs in its own package. Route fulfillment must
  use validated HTTPS bytes; browser navigation never bypasses destination checks.
- Stable registry tags checked 18 November 2026: Playwright 1.65.1; Kysely 0.29.9,
  pg 8.23.1, mysql2 3.24.6, better-sqlite3 13.2.0 (storage deferred to slice 3).
  Sources: https://nodejs.org/api/https.html, https://nodejs.org/api/net.html,
  https://playwright.dev/docs/network and official npm registry metadata.

## Handoff

Implemented in the core `/providers` subpath and optional CBE package. Telebirr
v5 table values, bilingual pairs, span pairs and CBE receiver fields are covered.
Conflicting duplicate fields, malformed exact money and dates, missing timestamps
and expected-ID conflicts fail closed. Saved and fetched evidence retain distinct
provenance. The browser receives only validated HTML, has no working outbound
transport, rejects subresources/popups/frames/websockets/service workers and bounds
DOM expansion, deadline, cancellation and per-instance concurrency. External CBE
assets are unsupported; no live provider requests or availability claims.

Review against code-review.md: DNS validation occurs in socket lookup, all results
must be public IPv4, and a fresh nonpooled connection uses the checked address.
TLS is verified, redirects and compressed bodies are refused, errors expose only
codes, retrieval precedes storage (none yet), and root imports stay dependency-free.
Tests use mocked HTTPS/DNS and real Chromium 159.0.8154.6 (Playwright 1.65.1).
Initial browser tests correctly failed before the matching browser was installed;
after setup all 186 cases passed. Vite+ task-plan JSON proves build dependency
ordering; combining recursive/filter flags is unsupported and was removed.

`pnpm verify` passed on Node 26.13.1 and `vp env exec --node 24.22.3 pnpm verify`
passed on Node 24.22.3: 186 tests plus 11 frozen reference cases, startup schema,
format/lint/strict types, both builds, publint and installed core/provider/CBE
runtime/declaration resolution. Core was installed alone offline before the
optional browser tarball and exact peer were added. Hosted CI is defined for both
runtimes; the first foundation run passed before this provider change. Packages
remain private; original source rights/license and npm identity/scope are unresolved.
Next: storage contract and direct SQL against real PostgreSQL/MySQL/SQLite.
