/** Shared display formatting helpers. */

/**
 * Formats a signed dollar amount with an explicit leading sign:
 *   1234  -> "+$1,234"
 *  -9815  -> "-$9,815"
 *      0  -> "$0"
 * The sign always matches the actual value — never "+$-9,815".
 */
export function formatSignedCurrency(value: number): string {
  const rounded = Math.round(value || 0);
  const magnitude = `$${Math.abs(rounded).toLocaleString()}`;
  if (rounded > 0) return `+${magnitude}`;
  if (rounded < 0) return `-${magnitude}`;
  return magnitude;
}

/**
 * Describes a "savings vs. gut-feel" figure: a positive value is money saved,
 * a negative value is money overspent relative to the baseline.
 */
export interface NetImpact {
  isPositive: boolean;
  isNegative: boolean;
  /** "Net Savings" when >= 0, "Net Overage" when negative. */
  noun: string;
  amount: string;
}

export function describeNetImpact(value: number, noun = 'Net Savings'): NetImpact {
  const rounded = Math.round(value || 0);
  return {
    isPositive: rounded >= 0,
    isNegative: rounded < 0,
    noun: rounded < 0 ? 'Net Overage' : noun,
    amount: formatSignedCurrency(rounded),
  };
}
