/**
 * Virtual-liquidity CPMM, the same integer maths as the contract's
 * `contracts/core/src/math/cpmm.rs`.
 *
 * A pool stores only outstanding YES/NO **share counts** and an immutable
 * liquidity constant `L`. The tradeable reserves are derived, never stored:
 *
 *   M   = ((y + n) + √((y − n)² + 4L²)) / 2
 *   R_y = M − y,  R_n = M − n        (invariant: R_y · R_n = L²)
 *   p_yes = R_n / (R_y + R_n)
 *
 * Note the inversion in the last line: the YES price comes off the **NO**
 * reserve, because buying YES drains R_y and makes YES scarcer.
 *
 * Everything is integer math on bigint so it matches the contract's result
 * exactly — never route these through `number`, u128 share counts overflow it.
 */

/** Integer square root (Newton's method), mirroring the contract's u128 sqrt. */
export function bigIntSqrt(value: bigint): bigint {
  if (value < 0n) throw new Error('sqrt of a negative number');
  if (value < 2n) return value;
  let x = value;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + value / x) / 2n;
  }
  return x;
}

/** Derived (R_yes, R_no) reserves for the given share counts. */
export function cpmmReserves(
  yesShares: bigint,
  noShares: bigint,
  l: bigint,
): [bigint, bigint] {
  const diff =
    yesShares > noShares ? yesShares - noShares : noShares - yesShares;
  const m = (yesShares + noShares + bigIntSqrt(diff * diff + 4n * l * l)) / 2n;
  return [m - yesShares, m - noShares];
}

/** Implied YES price in 0..1, or null when the pool has no liquidity. */
export function cpmmPriceYes(
  yesShares: bigint,
  noShares: bigint,
  l: bigint,
): number | null {
  if (l <= 0n) return null;
  const [ry, rn] = cpmmReserves(yesShares, noShares, l);
  const total = ry + rn;
  if (total <= 0n) return null;
  return Number(rn) / Number(total);
}

/**
 * Shares received for `netCollateral` (collateral AFTER the trade fee) when
 * buying `side`.
 */
export function cpmmBuyOut(
  yesShares: bigint,
  noShares: bigint,
  netCollateral: bigint,
  l: bigint,
  side: 'yes' | 'no',
): bigint {
  const [ry, rn] = cpmmReserves(yesShares, noShares, l);
  return side === 'yes'
    ? ry + netCollateral - (l * l) / (rn + netCollateral)
    : rn + netCollateral - (l * l) / (ry + netCollateral);
}

/** Fee charged on `amount` at `bps`, rounded up like the contract does. */
export function cpmmFee(amount: bigint, bps: number): bigint {
  return (amount * BigInt(bps) + 9_999n) / 10_000n;
}
