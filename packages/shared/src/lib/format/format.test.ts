import { describe, expect, it } from 'vitest';
import {
  DASH,
  formatFeeUsd,
  formatPct,
  formatQty,
  formatUsd,
  pnlTone,
  shortAddr,
  toNumber,
} from './index';

describe('toNumber', () => {
  it('reads numbers, strings and bigints', () => {
    expect(toNumber(12.5)).toBe(12.5);
    expect(toNumber('12.5')).toBe(12.5);
    expect(toNumber(' -3 ')).toBe(-3);
    expect(toNumber(42n)).toBe(42);
    expect(toNumber(0)).toBe(0);
  });

  it('scales base units exactly', () => {
    expect(toNumber(1_500_000n, 6)).toBe(1.5);
    expect(toNumber('1500000', 6)).toBe(1.5);
    expect(toNumber(-1n, 6)).toBe(-0.000001);
    expect(toNumber(123_456_789_012_345n, 6)).toBe(123456789.012345);
    expect(toNumber(1500, 3)).toBe(1.5);
    expect(toNumber('1.5', 2)).toBe(0.015);
  });

  it('returns null for nothing readable', () => {
    expect(toNumber(null)).toBeNull();
    expect(toNumber(undefined)).toBeNull();
    expect(toNumber('')).toBeNull();
    expect(toNumber('  ')).toBeNull();
    expect(toNumber('abc')).toBeNull();
    expect(toNumber(NaN)).toBeNull();
    expect(toNumber(Infinity)).toBeNull();
  });
});

describe('formatUsd', () => {
  it('formats with two decimals by default', () => {
    expect(formatUsd(0)).toBe('$0.00');
    expect(formatUsd(1234.56)).toBe('$1,234.56');
    expect(formatUsd(-5)).toBe('-$5.00');
    expect(formatUsd(1_234_567.891)).toBe('$1,234,567.89');
    expect(formatUsd(0.01)).toBe('$0.01');
  });

  it('takes strings and bigints', () => {
    expect(formatUsd('1234.5')).toBe('$1,234.50');
    expect(formatUsd('-0.5')).toBe('-$0.50');
    expect(formatUsd(1500n)).toBe('$1,500.00');
    expect(formatUsd(toNumber(2_500_000n, 6))).toBe('$2.50');
  });

  it('renders missing values as an em dash', () => {
    expect(formatUsd(null)).toBe(DASH);
    expect(formatUsd(undefined)).toBe(DASH);
    expect(formatUsd(NaN)).toBe(DASH);
    expect(formatUsd('nope')).toBe(DASH);
    expect(formatUsd(null, { sign: true, compact: true })).toBe(DASH);
  });

  it('does not round a non-zero amount to zero', () => {
    expect(formatUsd(0.004)).toBe('<$0.01');
    expect(formatUsd('0.000001')).toBe('<$0.01');
    expect(formatUsd(-0.004)).toBe('-<$0.01');
    expect(formatUsd(0.004, { sign: true })).toBe('+<$0.01');
    expect(formatUsd(0.0004, { dp: 3 })).toBe('<$0.001');
    expect(formatUsd(0.004, { compact: true })).toBe('<$0.01');
  });

  it('signs', () => {
    expect(formatUsd(12.3, { sign: true })).toBe('+$12.30');
    expect(formatUsd(-12.3, { sign: true })).toBe('-$12.30');
    expect(formatUsd(0, { sign: true })).toBe('$0.00');
    expect(formatUsd(-0, { sign: true })).toBe('$0.00');
  });

  it('compacts', () => {
    expect(formatUsd(1200, { compact: true })).toBe('$1.2K');
    expect(formatUsd(1234, { compact: true })).toBe('$1.23K');
    expect(formatUsd(3_400_000, { compact: true })).toBe('$3.4M');
    expect(formatUsd(18_449_000, { compact: true, dp: 1 })).toBe('$18.4M');
    expect(formatUsd(-2_500_000, { compact: true, sign: true })).toBe('-$2.5M');
    expect(formatUsd(1_200_000_000, { compact: true, sign: true })).toBe('+$1.2B');
    expect(formatUsd(12.345, { compact: true })).toBe('$12.35');
    expect(formatUsd(0, { compact: true })).toBe('$0');
  });

  it('shows the exact amount for balances', () => {
    expect(formatUsd(5, { exact: true })).toBe('$5.00');
    expect(formatUsd('5.0007', { exact: true })).toBe('$5.0007');
    expect(formatUsd('4.99993', { exact: true })).toBe('$4.99993');
    expect(formatUsd(0.000001, { exact: true })).toBe('$0.000001');
    expect(formatUsd(-1_234_567.1, { exact: true })).toBe('-$1,234,567.10');
    expect(formatUsd(0.5, { exact: true, sign: true })).toBe('+$0.50');
  });

  it('honours dp', () => {
    expect(formatUsd(1234.5, { dp: 0 })).toBe('$1,235');
    expect(formatUsd(0.4, { dp: 0 })).toBe('<$1');
    expect(formatUsd(1.23456, { dp: 4 })).toBe('$1.2346');
  });
});

describe('formatFeeUsd', () => {
  it('shows cents from a dollar up', () => {
    expect(formatFeeUsd(1.234)).toBe('$1.23');
    expect(formatFeeUsd('12.5')).toBe('$12.50');
  });

  it('shows four decimals below a dollar', () => {
    expect(formatFeeUsd(0.0007)).toBe('$0.0007');
    expect(formatFeeUsd(0.05)).toBe('$0.0500');
  });

  it('floors what four decimals cannot show, and dashes nothing', () => {
    expect(formatFeeUsd(0.00001)).toBe('<$0.0001');
    expect(formatFeeUsd(null)).toBe(DASH);
  });
});

describe('formatPct', () => {
  it('formats a percent number', () => {
    expect(formatPct(4.8)).toBe('4.80%');
    expect(formatPct(4.8, { dp: 1 })).toBe('4.8%');
    expect(formatPct(0)).toBe('0.00%');
    expect(formatPct(-12.345)).toBe('-12.35%');
    expect(formatPct('7.5')).toBe('7.50%');
    expect(formatPct(3n)).toBe('3.00%');
    expect(formatPct(1_234_567)).toBe('1234567.00%');
  });

  it('signs', () => {
    expect(formatPct(4.8, { sign: true, dp: 1 })).toBe('+4.8%');
    expect(formatPct(-4.8, { sign: true })).toBe('-4.80%');
    expect(formatPct(0, { sign: true })).toBe('0.00%');
  });

  it('takes ratios', () => {
    expect(formatPct(0.048, { fromRatio: true, dp: 1 })).toBe('4.8%');
    expect(formatPct(-0.5, { fromRatio: true, sign: true })).toBe('-50.00%');
  });

  it('renders missing values as an em dash', () => {
    expect(formatPct(null)).toBe(DASH);
    expect(formatPct(NaN)).toBe(DASH);
    expect(formatPct('')).toBe(DASH);
  });
});

describe('formatQty', () => {
  it('formats with up to four decimals', () => {
    expect(formatQty(0)).toBe('0');
    expect(formatQty(1234.56789)).toBe('1,234.5679');
    expect(formatQty(1.5)).toBe('1.5');
    expect(formatQty(-2)).toBe('-2');
    expect(formatQty('0.25', { dp: 1 })).toBe('0.3');
    expect(formatQty(10n ** 18n)).toBe('1,000,000,000,000,000,000');
  });

  it('does not round a non-zero amount to zero', () => {
    expect(formatQty(0.00001)).toBe('<0.0001');
    expect(formatQty(-0.004, { dp: 2 })).toBe('-<0.01');
  });

  it('compacts', () => {
    expect(formatQty(1200, { compact: true })).toBe('1.2K');
    expect(formatQty(3_456_789, { compact: true, dp: 1 })).toBe('3.5M');
    expect(formatQty(12, { compact: true })).toBe('12');
  });

  it('renders missing values as an em dash', () => {
    expect(formatQty(undefined)).toBe(DASH);
    expect(formatQty(NaN)).toBe(DASH);
  });
});

describe('pnlTone', () => {
  it('points the right way', () => {
    expect(pnlTone(1)).toBe('up');
    expect(pnlTone('0.0001')).toBe('up');
    expect(pnlTone(-3n)).toBe('down');
    expect(pnlTone(0)).toBe('flat');
    expect(pnlTone(null)).toBe('flat');
    expect(pnlTone(NaN)).toBe('flat');
  });
});

describe('shortAddr', () => {
  it('shortens long addresses', () => {
    expect(shortAddr('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU')).toBe('7xKX…gAsU');
    expect(shortAddr('0x1234567890abcdef', 6, 4)).toBe('0x1234…cdef');
  });

  it('leaves short or missing input alone', () => {
    expect(shortAddr('abcdefghij')).toBe('abcdefghij');
    expect(shortAddr('abcdefghijk')).toBe('abcd…hijk');
    expect(shortAddr('')).toBe('');
    expect(shortAddr(null)).toBe('');
  });
});
