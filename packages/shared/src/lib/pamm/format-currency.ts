/**
 * An amount in a collateral: `$1,000.00` for a dollar stablecoin, otherwise
 * `1,000.00 TUSDC`. An empty symbol still means dollars.
 */
const DOLLAR_PEGGED = new Set(['USDC', 'USDT', 'USD']);

/**
 * @deprecated for dollar amounts use `formatUsd` from `@/lib/format`. Not a
 * wrapper: this prints `$-5.00` for a negative and `$0.00` for a sub-cent
 * amount, where `formatUsd` prints `-$5.00` and `<$0.01`.
 */
export function formatCurrency(amount: number, symbol: string, decimals = 2): string {
  const s = (symbol ?? '').trim().toUpperCase();

  const formatted = amount.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  if (!s || DOLLAR_PEGGED.has(s)) {
    return `$${formatted}`;
  }

  return `${formatted} ${s}`;
}
