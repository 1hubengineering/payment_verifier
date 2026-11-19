# 0.2.0 release hardening

## Outcome and evidence

Prepare the SDK candidate for fresh installs. The playground reproduced an
`INVALID_INPUT` result on a key that already had a committed `VERIFIED` result.
It also exposed a Chromium startup failure that the CBE adapter mapped to
`INTERNAL_ERROR`. The 0.1.1 cutover in plan 017 is limited to development stores.

## Steps and validation

- [x] Enforce committed attempt and durable job bindings for invalid synchronous
      submissions. Exercise malformed input, wrong-provider input, split completion,
      and replay without another provider request.
- [x] Give Chromium launch failures a stable rendering-unavailable result. Check
      safe diagnostics, timeout and cancellation handling, and restored admission.
- [x] Explain the fresh-store release scope in package docs and the changelog.
- [x] Run `pnpm verify` in an isolated checkout with synthetic receipt evidence.

## Decisions

Invalid input on a new synchronous key remains uncommitted. Invalid input on an
existing binding returns a conflict without the stored result. Chromium launch
failures are terminal for the current attempt, with a fresh attempt available
after the runtime is repaired. Launch timeouts remain retryable. The sandbox
probe and authorized live provider smoke remain distinct acceptance checks.

## Handoff

The compiled CBE adapter passed 15 tests in the documented Chromium container
profile with Docker networking disabled. The tests used local transport fixtures
and exercised the real OS sandbox. Focused input and CBE tests passed on Node
24.22.3. Authorized live receipt smoke tests and a claim-preserving production
cutover remain release gates for live support and upgrades respectively.

`pnpm verify` passed on Node 26.13.1 in an isolated snapshot of the candidate
that excluded unrelated untracked drafts. It passed 323 workspace tests, 13
checkout-web tests, 297 real-engine adapter cases, and 11 frozen reference
tests, plus builds, installed-package checks, and the docs smoke test. The
Node 24.22.3 focused run passed 33 tests. A compiled SDK smoke check stored
and replayed the new CBE diagnostic and rejected malformed reuse of its key
after a single synthetic provider call.

Hosted verification and tagging still depend on the reviewed release commit.
