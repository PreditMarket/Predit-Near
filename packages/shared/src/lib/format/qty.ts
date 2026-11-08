import { DASH, toNumber, type Numeric } from './number';

export interface FormatQtyOptions {
  /** Maximum fraction digits (trailing zeros dropped). Default 4; 2 under `compact`. */
  dp?: number;
  /** `1.2K`, `3.4M`. */
  compact?: boolean;
}

/**
 * A plain quantity — token amounts, sizes, counts: `1,234.5678`, `1.2K`.
 *
 * Like `formatUsd`, a non-zero amount below the precision reads `<0.0001`
 * rather than `0`. Missing input is an em dash.
 */
export function formatQty(value: Numeric, options: FormatQtyOptions = {}): string {
  const n = toNumber(value);
  if (n === null) return DASH;

  const { compact = false } = options;
  const places = Math.max(0, options.dp ?? (compact ? 2 : 4));
  const abs = Math.abs(n);
  const prefix = n < 0 ? '-' : '';

  const floor = 10 ** -places;
  if (abs > 0 && abs < floor) {
    return `${prefix}<${floor.toLocaleString('en-US', { maximumFractionDigits: places })}`;
  }

  return `${prefix}${abs.toLocaleString('en-US', {
    maximumFractionDigits: places,
    ...(compact ? { notation: 'compact' as const } : {}),
  })}`;
}
