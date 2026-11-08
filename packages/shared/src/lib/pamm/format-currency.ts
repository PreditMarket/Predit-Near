/**
 * Format a numeric amount according to the collateral token symbol.
 * PXP        → "1,000 XP"
 * USDC/USDT  → "$1,000.00"
 * anything else → "1,000.00 BONK"
 *
 * The last case used to print "$1,000.00" too, which put a dollar sign on an
 * amount of something that is not dollars. Only the stablecoins get `$`; every
 * other symbol is spelled out after the number so the unit can never be
 * misread.
 *
 * An empty/missing symbol keeps the `$` rather than rendering a dangling
 * space: a good few callers pass `symbol ?? 'USDC'` precisely because USDC is
 * the assumed default, and one that slips through as `''` still means dollars.
 *
 * Note there are two deliberate local variants of this that are NOT bugs and
 * should stay separate: `formatFee` in creator-campaign-detail-page.tsx and in
 * admin's creator-leaderboard-table.tsx. They format in the browser locale,
 * drop decimals above 1000, and return null for nullish input so the caller
 * can skip rendering — none of which belongs in this function.
 */
const DOLLAR_PEGGED = new Set(['USDC', 'USDT', 'USD']);

/**
 * @deprecated for dollar amounts use `formatUsd` from `@/lib/format`. Not a
 * wrapper: this prints `$-5.00` for a negative and `$0.00` for a sub-cent
 * amount, where `formatUsd` prints `-$5.00` and `<$0.01`.
 */
export function formatCurrency(amount: number, symbol: string, decimals = 2): string {
  const s = (symbol ?? '').trim().toUpperCase();

  if (s === 'PXP') {
    return `${Math.round(amount).toLocaleString('en-US')} XP`;
  }

  const formatted = amount.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  if (!s || DOLLAR_PEGGED.has(s)) {
    return `$${formatted}`;
  }

  return `${formatted} ${s}`;
}
