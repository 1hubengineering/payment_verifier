# Independent AI Agent — Copy/Paste Handoff

**Task:** Independently evaluate, rebuild if justified, and harden the Ethiopian same-provider receipt-to-order verification POC. The accompanying `ETHIOPIAN_PAYMENT_RECEIPT_VERIFICATION_MASTER_PLAN.md` is the authoritative **project requirements and discussion summary**, not proof that future controls exist.

## Your first response

Before changing any code, read the master plan and source ZIPs. Produce the following *clearly labeled* outputs:

1. **Baseline reproduction:** actual results for current 11 synthetic tests; report if any required artifact is unavailable. The user reports a live Telebirr receipt-to-order match through v0.1.3 and a live historical CBE match through a diagnostic helper; do **not** claim that normal production CBE flow is fully proven.
2. **Risk assessment:** rank correctness, fraud, bank-availability, DNS/URL SSRF and Chromium sandbox, concurrent claims, bot/DoS resource exhaustion, crashes, job loss, data protection and unauthorized wallet-credit risks. Separate existing controls from recommendations.
3. **Architecture options:** keep current Telebirr-v5 HTTP parser plus CBE Playwright; propose a safer/more efficient alternative; investigate only documented or authorized provider APIs. Compare completeness, performance, failure modes, supportability and cost.
4. **Proposed engineering architecture:** shared provider-neutral compare engine, immutable server orders/unique reference, normalized adapter interface, persisted jobs, leases and retries, typed REST API, auth and tenant scoping, bounded worker queues, audit and observability, separate settlement/ledger gate.
5. **Executable verification plan:** fixture regression tests, intentional mismatches and missing fields, cross-process races, crash/restore, rate limits, abuse simulations against local mocks, p50/p95/p99/throughput benchmark on stated hardware. Restrict real bank requests to permitted low-volume smoke checks.
6. **Acceptance gates:** no silent verification on missing fields, no reused receipt claims, no lost acknowledged jobs across restart, no double wallet credit, no unbounded browser fanout, no fake settlement claim.

## Important inherited observations

- Current CLI is TypeScript/Node >=22.13 with `node:sqlite` and Playwright; Telebirr fetch is 15-second, no redirects, response <=2 MB. CBE browser is heavier; its navigation timeout is 30 seconds and it waits for receipt DOM content. There is no durable job/retry engine or public-facing API.
- Tests: 11/11 synthetic automated tests reported passed on Windows. User live Telebirr `MATCH` for a 10 ETB receipt with `dryRun=true`. User live CBE historical `MATCH` for 120,000 ETB using the separate diagnostic checker; reference was free-form and no claim made.
- CBE transient HTTP 502 and DOM timeout were observed before a later success. All unavailable/ambiguous provider retrieval must remain unverified and never trigger a wallet credit.
- No real bank latency average or safe concurrency has been measured. Prior 1–5s Telebirr, 5–20s CBE and 5–10/1–2 concurrency are **unverified planning hypotheses only**.
- Cross-provider transfers and independent merchant settlement proof are **out of scope** for current POC. Bank receipts can be valid but unrelated to the merchant payment.

## Operating rules

Do not perform new bank transfers, automate abusive external traffic, bypass login or terms, commit real receipts, log personal financial information, or conflate `MATCH` with settlement. Use deterministic synthetic fixtures for stress testing and controlled local fault injection. Propose changes in reviewable, tested increments, preserving known-good Telebirr v5 extraction. Explain any gaps rather than guessing or silently relaxing checks. Begin with the audit and options, not immediate feature coding.
