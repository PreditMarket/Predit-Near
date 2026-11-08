import { DASH, toNumber, type Numeric } from './number';

export interface FormatPctOptions {
  /** Prefix `+` on positive values (negatives always carry `-`; zero none). */
  sign?: boolean;
  /** Fraction digits, fixed. Default 2. */
  dp?: number;
  /** The input is a ratio (`0.048`), not a percent (`4.8`). */
  fromRatio?: boolean;
}

/**
 * A percent: `4.80%`, `+4.80%` (`sign`), `4.8%` (`dp: 1`).
 *
 * Takes a percent number by default — `formatPct(4.8)` — since that is what
 * the API sends; pass `fromRatio` for `0.048`. Missing input is an em dash.
 */
export function formatPct(value: Numeric, options: FormatPctOptions = {}): string {
  const raw = toNumber(value);
  if (raw === null) return DASH;

  const { sign = false, dp = 2, fromRatio = false } = options;
  const n = fromRatio ? raw * 100 : raw;
  const prefix = sign && n > 0 ? '+' : '';
  return `${prefix}${n.toFixed(Math.max(0, dp))}%`;
}
