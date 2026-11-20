The expected amount comes from the order. Convert canonical decimal text with
`parseEtbAmount('250.00')` to 25,000 minor units. The parser accepts positive ETB
with up to two decimal places and rejects whitespace, grouping separators,
scientific notation, extra precision and out-of-range amounts. The maximum is
`Number.MAX_SAFE_INTEGER` in minor units. It performs no rounding of input.
Compare the transfer principal and use the receipt's observed amount for any
financial posting.

Omit `amountPolicy` when creating the expectation for exact matching, or use
`{ mode: 'exact' }`. For tolerance, configure each direction separately on the
trusted expectation.

```js
const amountPolicy = {
  mode: 'tolerance',
  underpayment: { type: 'fixed', maxMinor: 100 },
  overpayment: { type: 'percentage', percent: '2.00' },
};
```

For 250.00 ETB this accepts 249.00 through 255.00 ETB, including both endpoints.
An omitted direction allows zero difference. A percentage is decimal text from
0 through 100 with up to two fractional digits. The computed allowance is
rounded down to whole minor units. Both directions are capped independently by
`maxPercent` (10% by default). Fixed allowances are nonnegative safe integers
and must also fit the cap. Configurations that take the minimum below one
minor unit or the maximum above the safe-integer limit are rejected.

`comparePaymentAmount(expectedMinor, actualMinor, policy)` returns the check
without I/O. The backend includes the same check in `result.checks`, with
`actual`, `details.differenceMinor` (actual minus expected), both inclusive
limits, direction, exactness and whether tolerance was applied. Amounts outside
the range fail with `AMOUNT_UNDERPAID` or `AMOUNT_OVERPAID`. Do not book the order
total as the received amount when using tolerance.
[Expected-payment fields and result handling](configuration.md)
