This should be a separate, focused implementation plan for our payment verification library. It will cover configurable underpayment and overpayment tolerance without changing the other verification rules we've already agreed on.

The default will remain exact matching, while developers can explicitly allow small differences using fixed ETB amounts or percentages.

# Implementation Plan: Configurable Payment Amount Tolerance

**Project:** AndHub Payment Verifier\
**Repository:** `1hubengineering/payment_verifier`\
**Feature:** Amount Matching Policies — Exact, Underpayment and Overpayment Tolerance\
**Target:** Pre-V1\
**Priority:** Independent enhancement\
**Status:** Proposed — Not Yet Implemented

---

## 1. Objective

Enhance the existing payment verification library to support flexible amount-matching rules.

Currently, payment verification compares the amount extracted from the official CBE or Telebirr receipt with the amount expected by the merchant.

The new feature must support:

1. Exact amount matching (default).
2. Configurable maximum acceptable underpayment.
3. Configurable maximum acceptable overpayment.
4. Tolerance values expressed as a fixed ETB amount or a percentage.
5. Precise reporting of the actual amount received, the expected amount, and any difference.

The developer must explicitly enable tolerance. The customer must never be able to control or modify the amount policy.

The existing receipt verification process must remain unchanged apart from the amount comparison logic.

## 2. Amount matching policies

### Policy A: Exact matching (default)

The paid amount must equal the expected amount.

```
amountPolicy: {
  mode: "exact"
}
```

Example:

| Expected   | Paid       | Result   |
| ---------- | ---------- | -------- |
| 100.55 ETB | 100.55 ETB | VERIFIED |
| 100.55 ETB | 100.00 ETB | MISMATCH |
| 100.55 ETB | 101.00 ETB | MISMATCH |

If no amount policy is configured, the SDK must behave as though `mode: "exact"` was specified.

### Policy B: Tolerance matching

The developer can configure independent maximum underpayment and overpayment limits.

Each limit can use either:

- Fixed amount, stored in ETB minor units.
- Percentage of the expected payment amount.

Example:

```
amountPolicy: {
  mode: "tolerance",

  underpayment: {
    type: "fixed",
    maxMinor: 60 // 0.60 ETB
  },

  overpayment: {
    type: "percentage",
    percent: "0.50" // 0.50%
  }
}
```

Both limits are optional. An omitted direction has zero tolerance.

The SDK must support mixing different units for the two directions, such as fixed underpayment and percentage overpayment.

Do not implicitly add a fixed allowance to a percentage allowance within the same direction.

## 3. Calculation rules

Let:

- `E` = expected amount in minor units.
- `A` = actual transferred amount in minor units.
- `U` = maximum allowed underpayment.
- `O` = maximum allowed overpayment.

Calculate:

```
minimumAccepted = E - U
maximumAccepted = E + O

accepted =
  A >= minimumAccepted &&
  A <= maximumAccepted
```

All boundaries are inclusive.

If the actual payment equals the expected amount, it is an exact match regardless of whether tolerance is enabled.

### Percentage calculation

Convert configured percentages to integer basis points.

```
1%     = 100 basis points
0.50%  = 50 basis points
1.25%  = 125 basis points
```

Calculate a percentage allowance as:

```
allowanceMinor =
  floor(expectedMinor * basisPoints / 10000)
```

Use integer arithmetic, preferably `bigint` internally, to avoid overflow and floating-point rounding errors.

Rounding down ensures that the implemented allowance never exceeds the developer's specified percentage.

Convert the resulting values back to safe integer minor units only after checking bounds.

### Example

Expected payment: **100.55 ETB**

Developer configuration:

- Maximum underpayment: 0.60 ETB
- Maximum overpayment: 0.50%

Calculated accepted range:

```
Minimum = 99.95 ETB
Maximum = 101.05 ETB
```

| Customer paid | Difference | Result   | Explanation                   |
| ------------- | ---------- | -------- | ----------------------------- |
| 99.90 ETB     | -0.65      | MISMATCH | Below minimum                 |
| 100.00 ETB    | -0.55      | VERIFIED | Within underpayment allowance |
| 100.55 ETB    | 0.00       | VERIFIED | Exact match                   |
| 101.00 ETB    | +0.45      | VERIFIED | Within overpayment allowance  |
| 101.10 ETB    | +0.55      | MISMATCH | Above maximum                 |

These results assume all other mandatory receipt checks pass.

## 4. Configuration and ownership

The amount policy should be part of the trusted payment expectation or explicitly resolved from a server-side default when the expectation is created.

Recommended resolution:

1. Use a validated policy specified by the host for this payment.
2. Otherwise, use the host's configured default policy.
3. Otherwise, use exact matching.

The effective policy must be validated and frozen when the payment expectation is registered.

Do not dynamically change the acceptance policy while verifying an existing expectation.

This ensures that an order's payment requirements remain consistent across retries and concurrent submissions.

### Example payment expectation

```
const expectation = createPaymentExpectation({
  tenantId: "merchant-1",
  paymentId: "ORDER-1042",

  provider: "telebirr",
  currency: "ETB",
  amountMinor: 10055,

  recipientName: "Example Merchant",
  recipientAccountLast4: "1123",
  reference: "INV-1042-AB12",

  validFrom: paymentStart,
  validUntil: paymentDeadline,

  amountPolicy: {
    mode: "tolerance",

    underpayment: {
      type: "fixed",
      maxMinor: 60
    },

    overpayment: {
      type: "percentage",
      percent: "0.50"
    }
  }
});
```

This API is proposed; integrate it with the existing project's actual types rather than treating the example as already implemented.

## 5. Input and policy validation

The library must reject invalid configuration instead of silently correcting it.

Validation requirements:

- `mode` must be `exact` or `tolerance`.
- Expected payment must be a positive safe integer in minor units.
- Fixed allowances must be nonnegative integers.
- Percentage values must be valid nonnegative decimal percentages, supporting at most two decimal places.
- Convert percentages deterministically to integer basis points.
- Reject negative allowances, `NaN`, infinity, unsafe integers, and unsupported configuration fields.
- Do not permit the underpayment allowance to make a zero or negative transferred amount eligible for verification.
- Enforce safe configurable upper limits on tolerances to protect merchants from accidental excessively permissive settings.
- Check addition and multiplication for overflow.
- Do not silently clamp invalid values.

Any merchant-configured limit must be documented clearly.

Policy configuration and updates must happen through trusted server-side application code, not customer input.

## 6. Verification outcome contract

Preserve the agreed public statuses:

- `VERIFIED`
- `MISMATCH`
- `NOT_FOUND`
- `UNAVAILABLE`
- `INVALID_INPUT`

The amount policy changes only the result of the amount check.

### Successful exact match

```
{
  "verified": true,
  "status": "VERIFIED",
  "code": "PAYMENT_VERIFIED",
  "amountCheck": {
    "status": "PASS",
    "rule": "exact",
    "expectedMinor": 10055,
    "actualMinor": 10055,
    "differenceMinor": 0,
    "exactMatch": true,
    "toleranceApplied": false
  }
}
```

### Successful tolerated underpayment

```
{
  "verified": true,
  "status": "VERIFIED",
  "code": "PAYMENT_VERIFIED",
  "amountCheck": {
    "status": "PASS",
    "rule": "within_tolerance",
    "expectedMinor": 10055,
    "actualMinor": 10000,
    "differenceMinor": -55,
    "exactMatch": false,
    "toleranceApplied": true,
    "direction": "UNDERPAID",
    "minimumAcceptedMinor": 9995,
    "maximumAcceptedMinor": 10105
  }
}
```

### Failed underpayment check

```
{
  "verified": false,
  "status": "MISMATCH",
  "code": "AMOUNT_UNDERPAID",
  "amountCheck": {
    "status": "FAIL",
    "rule": "within_tolerance",
    "expectedMinor": 10055,
    "actualMinor": 9990,
    "differenceMinor": -65,
    "minimumAcceptedMinor": 9995,
    "maximumAcceptedMinor": 10105
  }
}
```

These examples show the amount-related portion of the full SDK response. Implement the information within the agreed `checks` contract, rather than creating a separate independently maintained result that could contradict it.

The developer must always be able to determine:

- Expected amount.
- Actual transferred amount from the official receipt.
- Signed difference.
- Applied policy.
- Calculated acceptable range.
- Whether the amount matched exactly.
- Whether tolerance was used.
- Why the amount check passed or failed.

Do not report the expected amount as the amount received when they differ.

### Error codes

Add:

- `AMOUNT_UNDERPAID`
- `AMOUNT_OVERPAID`
- `INVALID_AMOUNT_POLICY`

Use `AMOUNT_UNDERPAID` or `AMOUNT_OVERPAID` for a definitive out-of-range payment.

Use `INVALID_AMOUNT_POLICY` as a configuration/operation error, not a payment mismatch.

If the official receipt does not contain a reliable amount, preserve the agreed incomplete-evidence behavior. Do not infer an amount from the customer's SMS.

## 7. Integration with the existing comparison engine

Inspect the current amount comparison logic before making changes.

The existing implementation uses a direct amount equality comparison.

Replace only the amount-specific comparison with a pure function, provisionally named:

```
comparePaymentAmount(
  expectedMinor,
  actualMinor,
  amountPolicy
)
```

The function should return structured comparison data rather than performing I/O.

Responsibilities:

1. Validate the policy.
2. Calculate underpayment and overpayment allowances.
3. Determine the accepted interval.
4. Compare the actual amount with that interval.
5. Return a precise amount-check result.
6. Preserve the actual signed difference.
7. Explain the matching rule used.

The function must not access the network, retrieve receipts, mutate storage, or change order states.

The main receipt comparison engine consumes this result alongside the existing recipient, invoice, status, currency, and time checks.

**Important:** A tolerated amount alone never makes a payment verified. All other required checks must also pass.

## 8. Duplicate claims and idempotency

Preserve the existing transaction claim and idempotency logic.

If a payment within tolerance is successfully verified:

- The official transaction is claimed according to the existing receipt-claim policy.
- The recorded actual amount remains unchanged.
- The applied policy and comparison outcome are persisted consistently.
- Replaying the same completed attempt returns its original result.
- A previously claimed receipt must not become reusable merely because the amount policy differs.

Tolerance must not allow the same transaction to be applied to multiple payment expectations.

Do not modify the existing database and ORM architecture except where required to persist the effective policy or updated result.

## 9. Security and business responsibility

The amount tolerance feature must not weaken existing verification requirements.

Preserve:

- Official CBE/Telebirr receipt retrieval.
- Trusted merchant recipient validation.
- Invoice/reference matching.
- Successful transaction-status checks.
- Tenant isolation.
- Atomic receipt claims.
- Provider URL restrictions.
- Idempotency and recovery.

The integrating developer decides whether to accept underpayments, overpayments, or exact payments.

The SDK reports the observed payment and applies the developer's explicitly configured acceptance policy.

The host application remains responsible for any additional business treatment, such as accounting for an overpayment or adjusting its internal invoice records.

## 10. Tests and acceptance criteria

Add focused unit tests covering these cases:

| Scenario                                          | Expected result                        |
| ------------------------------------------------- | -------------------------------------- |
| No policy supplied                                | Exact matching                         |
| Explicit exact policy                             | Exact matching                         |
| Exact amount                                      | PASS                                   |
| Below expected, no allowance                      | `AMOUNT_UNDERPAID`                     |
| Above expected, no allowance                      | `AMOUNT_OVERPAID`                      |
| Underpayment exactly at allowance boundary        | PASS                                   |
| Overpayment exactly at allowance boundary         | PASS                                   |
| One minor unit below minimum                      | FAIL                                   |
| One minor unit above maximum                      | FAIL                                   |
| Fixed underpayment + percentage overpayment       | Correct combined range                 |
| Percentage resulting in fractional minor units    | Deterministic rounding down            |
| Zero or omitted directional tolerance             | No tolerance in that direction         |
| Invalid or excessive configuration                | Rejected before verification           |
| Missing amount in provider receipt                | Incomplete evidence, never VERIFIED    |
| Tolerated amount with wrong invoice               | MISMATCH                               |
| Tolerated amount with wrong recipient             | MISMATCH                               |
| Multiple simultaneous mismatches                  | All findings preserved                 |
| Reused transaction under another tolerance policy | Claim protection enforced              |
| Repeated idempotent submission                    | Same stored outcome                    |
| Browser/client attempts to change policy          | Server ignores or rejects modification |

Also verify:

- Pure comparison tests.
- Existing receipt provider tests.
- SDK integration tests.
- Database adapter tests where expectation/result storage changes.
- TypeScript public types and serialization.
- Fastify and web-checkout examples where affected.

Use synthetic fixtures and mocked official receipts. Do not create unnecessary live-provider traffic for amount-tolerance testing.

## 11. Implementation phases

### Phase 1 — Review and design

Inspect the existing expectation schema, amount comparison function, result contract, and persistence logic.

Produce a short impact assessment and confirm the proposed policy structure.

### Phase 2 — Pure amount policy engine

Implement policy validation, deterministic allowance calculations, and the amount comparison function.

Complete unit tests.

### Phase 3 — Verification engine integration

Integrate the amount check into the official receipt comparison workflow.

Update the public result types and structured diagnostics.

### Phase 4 — Persistence and SDK integration

Snapshot the effective policy in trusted expectations.

Preserve claims, idempotency, transactions, and durable jobs.

Update examples only where necessary.

### Phase 5 — Documentation and verification

Document both modes with examples, including how tolerated payments are reported.

Run all relevant existing tests and report regressions.

## 12. Definition of done

This feature is complete when:

- Exact matching remains the default.
- Developers can independently configure permitted underpayment and overpayment.
- Either direction supports fixed minor units or percentages.
- All calculations are deterministic and safe.
- A payment within the configured interval passes the amount check.
- A payment outside the interval returns the correct directional mismatch.
- The library always reports the actual amount received.
- All other receipt checks remain mandatory and unchanged.
- Duplicate claims, persistence, and idempotency still work.
- Tests demonstrate boundary behavior and no regressions.
- Documentation explains the behavior accurately.

## 13. Delivery instructions

Implement this as a separate feature branch in the existing repository.

Breaking changes are acceptable during pre-V1 development. Do not add unnecessary compatibility aliases.

Do not rebuild the verifier, replace the toolchain, or refactor unrelated modules.

Do not publish npm packages or create a public release.

When complete, provide a concise implementation report describing the changed files, final API, test results, and any limitations.

**Core feature principle:**

The library verifies the exact amount received from the official payment provider against the merchant's configured acceptance range. It never changes, conceals, or misrepresents the actual transferred amount.

### Suggested implementation order

I would implement this after the clean verification response contract is established, because the tolerance feature needs to report details through that new contract.

It can still be developed independently as a separate feature branch and merged once the response contract is ready.
