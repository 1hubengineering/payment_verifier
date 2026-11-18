# Provider-neutral comparison

This slice is complete and included in [0.1.0](../releases/0.1.0.md). The acceptance
counts and next steps below record its original handoff; see the
[roadmap](../roadmap.md) for current scope.

## Outcome and scope

Slice 1 adds immutable, runtime-validated trusted payment expectations and a pure
comparison of normalized receipt evidence. It returns field checks and receipt-only
outcomes; it cannot claim a transaction, confirm settlement, or fulfill an order.
Hosts must authorize the payment and supply expected values from their own records.

## Evidence

The existing core parses decimal ETB exactly but has no comparison API. The frozen
reference compares provider, transaction ID, successful status, recipient name and
account suffix, exact reference, CBE A2A payment type, and optional time bounds.
Its floating-point amounts and optional time checks are unsuitable for the new API.
All initial workspace files are untracked; there is no initial commit or remote.

## Steps

- [x] Inspect instructions, roadmap, existing core and frozen comparison behavior.
- [x] Add expectation snapshot, normalized evidence and deterministic comparison.
- [x] Add synthetic regressions for missing, ambiguous, malformed and conflicting fields.
- [x] Exercise the installed API and declarations; preserve the frozen reference.
- [x] Review financial/security boundaries, run `pnpm verify`, update roadmap.
- [x] Commit with verified 1hubengineering identity after account verification.

## Validation

Require exact positive safe integer ETB minor units, a provider, tenant/payment IDs,
recipient name and four-digit suffix, a case-sensitive reference token, and inclusive
integer epoch-millisecond time bounds. Invalid expectations throw before comparison.
Missing, malformed or ambiguous evidence returns UNABLE_TO_VERIFY, even when another
field conflicts. Complete contradictory evidence returns MISMATCHED. Every check
must pass to return MATCHED_RECEIPT_ONLY with settlement UNCONFIRMED.

Test boundary timestamps, invalid runtime values, mutation of snapshots, amount
rounding attacks, reference substring/case changes, status and provider mismatches,
CBE payment type, and each missing/ambiguous required field. Package checks must
exercise the actual installed ESM and emitted types, without workspace aliases.
Run `pnpm verify` before committing. No live provider traffic is required.

## Decisions

- Use epoch milliseconds at the normalized domain boundary; provider packages own
  strict timezone-aware date parsing. No ambient clock or implicit timezone.
- Keep name normalization limited to whitespace and case. Account suffix and
  reference require exact comparison; never infer full account identity from a suffix.
- Require time bounds for every expectation. Immutable snapshots explicitly copy
  only known fields, so unrelated submission fields cannot override expectations.
- Ambiguity is an explicit list of fields supplied by the parser, never a first-value
  selection in the comparison layer. Extractors must detect contradictions.
- This pure API compares supplied evidence; retrieval provenance and authenticity
  remain the next slice. A caller can fabricate evidence, so no storage/claim API
  accepts a caller-supplied comparison result.

## Handoff

`pnpm verify` passed on Node 26.13.1 and Node 24.22.3; final runs cover 96 core
tests, 11 unchanged reference tests, Varlock startup validation, formatting/lint,
both strict type checks, ESM/Oxc build, publint, and installed npm consumer
runtime/declaration checks. Review found sparse ambiguity arrays could skip
validation; Array.from and a regression close that failure. All ten frozen source,
test and fixture files were compared byte-for-byte with the original archive.

Review against code-review.md: comparison cannot settle, claim or perform I/O;
invalid expectations throw; unknown receipt shapes fail closed; monetary evidence
never coerces strings or rounds; results contain checks without sensitive values.
Persistence races, tenant authorization and provider authenticity remain outside
this pure slice, with no support claims.

GitHub CLI and connector authenticate 1hubengineering. After the user refreshed
permissions, GET /user/emails confirmed andhubengineering@gmail.com is primary
and verified. Repository-local Git identity uses 1hubengineering and that email;
the unrelated global identity is preserved. This initial commit includes the
previously untracked foundation and slice 1. Packages remain private; npm login,
source rights/license and scope access remain unresolved. No release is created.

Next: provider extraction and bounded retrieval, with parser provenance and local
failure tests. Do not expose stored claims accepting arbitrary comparison results.
