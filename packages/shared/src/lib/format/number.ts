/**
 * The one place a displayable figure gets turned into a `number`.
 *
 * Amounts reach the UI as numbers, decimal strings (contract views) and
 * bigints (on-chain base units). Every formatter in `lib/format` goes through
 * `toNumber`, so a missing or unreadable value is `null` — rendered as an em
 * dash — rather than `NaN` or a confident `0`.
 */

export const DASH = '—';

export type Numeric = number | string | bigint | null | undefined;

/** `1234567n` at 6 decimals → `"1.234567"`, exactly — no float division. */
function baseUnitsToDecimal(units: bigint, decimals: number): string {
  const negative = units < BigInt(0);
  const digits = (negative ? -units : units).toString().padStart(decimals + 1, '0');
  const whole = digits.slice(0, -decimals);
  const fraction = digits.slice(-decimals);
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

/**
 * A number, or `null` when there is nothing readable.
 *
 * `decimals` treats the input as base units (like viem's `formatUnits`):
 * `toNumber(1_500_000n, 6)` → `1.5`. Integer strings and bigints are scaled
 * exactly; a fractional string or a number is divided.
 */
export function toNumber(value: Numeric, decimals = 0): number | null {
  if (value === null || value === undefined) return null;

  if (typeof value === 'bigint') {
    return decimals > 0 ? Number(baseUnitsToDecimal(value, decimals)) : Number(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    if (decimals > 0 && /^-?\d+$/.test(trimmed)) {
      return Number(baseUnitsToDecimal(BigInt(trimmed), decimals));
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return null;
    return decimals > 0 ? parsed / 10 ** decimals : parsed;
  }

  if (!Number.isFinite(value)) return null;
  return decimals > 0 ? value / 10 ** decimals : value;
}

export type PnlTone = 'up' | 'down' | 'flat';

/** Which way a PnL figure points. Zero and missing values are `flat`. */
export function pnlTone(value: Numeric): PnlTone {
  const n = toNumber(value);
  if (n === null || n === 0) return 'flat';
  return n > 0 ? 'up' : 'down';
}
