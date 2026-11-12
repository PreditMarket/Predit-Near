/** Number formatting helpers for the trade card. All cent prices are integer. */

/** Integer cents from a 0..1 probability. */
export const cents = (p: number): string => `${Math.round(p * 100)}¢`;

/** 2-decimal percent from a 0..1 probability (e.g. "50.12%"). */
export const pct2 = (p: number): string => `${(p * 100).toFixed(2)}%`;

/** USD, 2 decimals, no thousands separator (matches mockup e.g. "$38.12"). */
export const usd2 = (n: number): string => `$${n.toFixed(2)}`;

/**
 * Headline USD formatter that adapts precision to magnitude so sub-$1 amounts
 * don't collapse to "$0":
 *  - < $10  → 2 decimals ("$0.30")
 *  - < $1k  → integer      ("$347")
 *  - ≥ $1k  → integer + thousands separator ("$1,238")
 */
export const usdSmart = (n: number): string => {
  const abs = Math.abs(n);
  if (abs < 10) return `$${n.toFixed(2)}`;
  return `$${Math.round(n).toLocaleString()}`;
};

/** A share or token amount, up to 2 decimals. */
export function fmtTokenAmount(amount: number): string {
  return amount.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/** Human token amount from raw base units. */
export const rawToUnits = (raw: bigint, decimals: number): number =>
  Number(raw) / 10 ** decimals;
