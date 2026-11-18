# Library review criteria

Review consequential behavior and identify a concrete failing scenario before
requesting changes. Check:

- Missing or contradictory receipt fields cannot produce a match. Exact amounts,
  expected recipient, provider, reference, status, and time policy are enforced.
- Trusted payment expectations come from the host; authorization and tenant
  boundaries are preserved. Public submissions cannot override expected values.
- Receipt-only outcomes never become settled payments or fulfillment signals.
- Same idempotency key and input return the same committed result; conflicting
  reuse is explicit. Provider transaction and payment claims are atomic under
  races, rollback, and process failure. Network retrieval stays outside locks.
- Adapter operations use the actual caller transaction and preserve connection
  ownership. Uniqueness and collation behavior are exercised on each real engine.
- Provider lookups bound time, bytes, redirects, DNS/IP destinations, and browser
  work. Availability and parser failures remain unverified. No private data leaks
  in errors or diagnostics.
- Installed ESM exports and declarations work without workspace aliases or dev
  dependencies. Core imports do not load environment, driver, or browser code.
- Compatibility documentation reflects real versioned integration tests. Synthetic
  baseline results are not represented as live provider or settlement proof.

For initial scaffold changes, run `pnpm verify` and inspect the packed consumer.
As persistence and retrieval land, extend acceptance with engine-backed contract,
race, rollback, restart, and local security failure tests before advertising them.
