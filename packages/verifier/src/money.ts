/** Positive ETB amount in integer birr cents, bounded by Number.MAX_SAFE_INTEGER. */
export type EtbMinorUnits = number & { readonly __etbMinorUnits: unique symbol };

/** Parse canonical decimal text without floating-point multiplication or rounding. */
export function parseEtbAmount(value: string): EtbMinorUnits {
  if (
    typeof value !== 'string' ||
    value.trim() !== value ||
    !/^(0|[1-9]\d{0,13})(\.\d{1,2})?$/.test(value)
  ) {
    throw new TypeError('Expected positive decimal ETB text with at most two decimal places');
  }

  const [whole = '0', fraction = ''] = value.split('.');
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (minor <= 0n || minor > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('ETB amount must be positive and fit in a safe integer');
  }
  return Number(minor) as EtbMinorUnits;
}
