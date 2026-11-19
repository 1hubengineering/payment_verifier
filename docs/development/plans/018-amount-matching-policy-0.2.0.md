# 018 · Amount matching policy for 0.2.0

## Outcome and scope

Add a trusted per-payment `amountPolicy` to the [0.2.0 verification contract](017-verification-contract-0.2.0.md).
Exact matching remains the default. The host can independently allow underpayment and
overpayment in fixed ETB minor units or as a decimal percentage of the expected amount.
The other required checks and receipt claim policy retain their existing behavior.

## Decisions

- Resolve a per-payment policy first, then an explicit server-owned default passed to
  `createPaymentExpectation`, then exact. Validate, normalize, and freeze the effective
  policy in the expectation. Policy changes participate in expectation conflict checks
  and durable job snapshots.
- Tolerance uses inclusive bounds. Omitted directions allow zero difference. Use integer
  basis points and `bigint` multiplication with floor division. Reject a policy with an
  unsafe upper bound or a lower bound below one minor unit.
- Default the tolerance cap to 10% of the expected amount per direction, for fixed and
  percentage allowances. Trust host-configured `maxPercent` up to 100%. Reject excessive
  allowances and unsafe arithmetic with `INVALID_AMOUNT_POLICY`.
- Put amount diagnostics on the existing `amountMinor` check. Report expected and actual
  minor units, the signed difference, range, policy, exact match, direction, and tolerance
  applied. Return `AMOUNT_UNDERPAID` or `AMOUNT_OVERPAID` for definitive failures. Missing
  or unreliable amounts retain their evidence states and a null actual amount.
- Keep tolerance out of customer submission schemas. The host owns accounting and
  business treatment for a tolerated payment.

## Steps and validation

- [x] Implement the pure amount policy engine on a local feature branch. Cover both modes,
      independent directions, mixed units, inclusive limits, one-unit failures, floor
      rounding, invalid shapes, positivity, configurable ceilings, and safe integer limits.
- [x] Integrate the amount check once the new comparison shape is in place. Verify that
      unrelated required failures still prevent verification and multiple findings survive.
- [x] Persist the normalized policy and actual amount in and alongside the existing records.
      Verify policy changes conflict with the registered expectation, exact replay retains
      the original observation, and a receipt cannot be claimed twice under different policies.
- [x] Extend package types, fixtures, the adapter matrix, and the SDK guide. Confirm Fastify
      rejects client policy fields. Use synthetic receipts and run the 0.2.0 release checks.

## Handoff

The pure and SDK comparison paths share `comparePaymentAmount`. The accepted policy is
persisted with the expectation. Amount findings live in `checks` and replay with the original
actual amount. Tests cover inclusive boundaries, rejection of customer policy fields, and
claim uniqueness across different policies. Full verification passed on Node 26.13.1 and 24.22.3.
