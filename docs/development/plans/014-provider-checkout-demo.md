# 014 — Ethiopian checkout demo

## Outcome and scope

Show CBE and Telebirr transfer instructions and accept a transaction number, receipt
URL, or SMS in the existing public-ready checkout example. Keep all accounts and
trusted mock records synthetic. Do not change the published SDK or Fastify API.

## Evidence and decisions

- The existing shadcn checkout delegates submission to its host. Keep its
  reference-only mode and add an opt-in evidence mode.
- Reuse the SDK's pure ETB parser and locator rules in the private demo. No
  browser or server provider retrieval is introduced.
- The user supplied separate Telebirr and CBE SMS formats. Tests use redacted
  copies that preserve structure without retaining real names, balances,
  receipt tokens, transfer amounts, or account suffixes.
- Store only approved synthetic identifiers and order-scoped outcomes in memory.
  Do not save raw SMS, paste contents, or unknown identifiers. Production hosts
  still own authorized intake, protected storage and atomic claims.
- UI/UX Pro Max favors a simple checkout, visible selection, readable contrast,
  large controls, and inline errors. Keep the site's visual tokens.

## Steps and validation

- [x] Add configurable branded instructions, copy controls and keyboard tabs.
- [x] Add provider-specific extraction, independent local mock checks and deduplication.
- [x] Test malformed and conflicting evidence, browser interactions and workspace checks.

## Handoff

`pnpm verify` passed 525 tests, including 34 checkout tests, plus the site
build and documentation MCP smoke test. Sandboxed Chromium checked the layout,
both logos, copy controls, keyboard navigation, SMS submission and duplicate
handling at 320px, 375px, 844px landscape and 1440px. The final build also
passed the skip-link, unavailable/retry and pending-review checks. No supplied
private sample data was found in the build.

The CBE sample has no transfer date or explicit transaction number. The parser
keeps those fields missing. The simulated positive CBE example includes a
synthetic date; otherwise the SMS cannot match on its own. Neither the mock
match nor a duplicate result confirms settlement or authorizes fulfillment.

The [Pages deployment](https://github.com/1hubengineering/payment_verifier/actions/runs/44416752469)
published the [checkout demo](https://1hubengineering.github.io/payment_verifier/demo/).
Live Chromium checks at 375px and 1440px covered both providers, all evidence
tabs, clipboard, retries, wrong-provider URLs and duplicate handling. The public
demo does not enable live payments, receipt-provider calls, or an npm release.
