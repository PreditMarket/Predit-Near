import { DASH, toNumber, type Numeric } from './number';

export interface FormatUsdOptions {
  /** `$1.23K`, `$18.4M`. `dp` caps the fraction digits (default 2). */
  compact?: boolean;
  /** Prefix `+` on positive values (negatives always carry `-`; zero none). */
  sign?: boolean;
  /**
   * Show what is actually there, for balances: at least 2 and up to `dp`
   * (default 6) fraction digits, trailing zeros past the cent dropped.
   * `$5.0007` rather than `$5.00`.
   */
  exact?: boolean;
  /** Fraction digits. Default 2 (fixed); the maximum under `compact`/`exact`. */
  dp?: number;
}

const usd = (abs: number, options: Intl.NumberFormatOptions) =>
  abs.toLocaleString('en-US', { style: 'currency', currency: 'USD', ...options });

/**
 * US dollars: `$1,234.56`, `-$5.00`, `+$12.30` (`sign`), `$1.2K` (`compact`).
 *
 * A non-zero amount too small to show at the requested precision reads
 * `<$0.01` (`-<$0.01` when negative) instead of rounding to `$0.00`, which
 * would say nothing happened. `exact` has no such floor. Missing or unreadable
 * input renders as an em dash.
 */
export function formatUsd(value: Numeric, options: FormatUsdOptions = {}): string {
  const n = toNumber(value);
  if (n === null) return DASH;

  const { compact = false, sign = false, exact = false, dp } = options;
  const abs = Math.abs(n);
  const prefix = n < 0 ? '-' : sign && n > 0 ? '+' : '';

  if (exact) {
    const places = Math.max(2, dp ?? 6);
    return `${prefix}${usd(abs, { minimumFractionDigits: 2, maximumFractionDigits: places })}`;
  }

  const places = Math.max(0, dp ?? 2);
  const floor = 10 ** -places;
  if (abs > 0 && abs < floor) {
    return `${prefix}<${usd(floor, { minimumFractionDigits: places, maximumFractionDigits: places })}`;
  }

  if (compact) {
    return `${prefix}${usd(abs, { notation: 'compact', maximumFractionDigits: places })}`;
  }

  return `${prefix}${usd(abs, { minimumFractionDigits: places, maximumFractionDigits: places })}`;
}

/**
 * A fee. Cents from $1 up; four decimals below, because fees on small orders
 * run to fractions of a cent and two decimals would show them as nothing.
 */
export function formatFeeUsd(value: Numeric): string {
  const n = toNumber(value);
  if (n === null) return DASH;
  return formatUsd(n, { dp: Math.abs(n) >= 1 ? 2 : 4 });
}
