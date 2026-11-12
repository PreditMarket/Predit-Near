/**
 * Contract trading rules, mirrored so the UI can explain a refusal before the
 * user signs instead of surfacing a raw contract error afterwards.
 */
import type { NormalizedPoolStateV3 } from '@/hooks/pamm/use-pool-state';

/**
 * The contract blocks trades within `trade_freeze_sec` of expiry, so nobody
 * trades on information that arrives right as the market closes.
 */
function getTradeFreezeStartTs(
  expiryTs: number,
  tradeFreezeSeconds: number,
): number {
  return expiryTs - tradeFreezeSeconds;
}

export function isTradeFrozen(
  expiryTs: number,
  tradeFreezeSeconds: number,
  nowTs = Math.floor(Date.now() / 1000),
): boolean {
  return (
    nowTs >= getTradeFreezeStartTs(expiryTs, tradeFreezeSeconds) &&
    nowTs < expiryTs
  );
}

/** Seconds until the freeze window opens; 0 once it has. */
export function getSecondsUntilFreeze(
  expiryTs: number,
  tradeFreezeSeconds: number,
  nowTs = Math.floor(Date.now() / 1000),
): number {
  return Math.max(
    getTradeFreezeStartTs(expiryTs, tradeFreezeSeconds) - nowTs,
    0,
  );
}

/**
 * Estimated `redeem` payout for a winning position — cost-weighted
 * (uniform-ROI) parimutuel, matching the contract's `plan_redeem`:
 *
 *   lose_cost = resolved_pool_collateral − resolved_x_win
 *   bonus     = winning_cost_acc × lose_cost / resolved_x_win
 *   gross     = winning_cost_acc + bonus
 *             = winning_cost_acc × resolved_pool_collateral / resolved_x_win
 *   net       = gross − ceil(gross × resolved_redeem_fee_bps / 10_000)
 *
 * i.e. every winner earns identical ROI = `lose_cost / X_win`; share counts
 * don't feed it. Returns null until the pool is settled with a winner. Uses the
 * fee frozen at settlement, as the contract does.
 */
export function estimateV3Payout(
  v3: Pick<
    NormalizedPoolStateV3,
    | 'resolvedPoolCollateral'
    | 'resolvedXWin'
    | 'resolvedRedeemFeeBps'
  >,
  winningCostAcc: bigint,
): { gross: bigint; fee: bigint; net: bigint } | null {
  if (v3.resolvedXWin <= BigInt(0)) return null;
  if (winningCostAcc <= BigInt(0)) return null;

  // Same u128-floor mul_div as the contract, so it matches to the atom; the fee rounds up.
  const gross =
    (winningCostAcc * v3.resolvedPoolCollateral) / v3.resolvedXWin;
  const feeBps = BigInt(v3.resolvedRedeemFeeBps);
  const feeNum = gross * feeBps;
  const fee =
    feeNum === 0n
      ? 0n
      : (feeNum + 10_000n - 1n) / 10_000n;
  return { gross, fee, net: gross - fee };
}

/** Human "1h 20m" style countdown. */
export function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(Math.ceil(totalSeconds), 0);
  const days = Math.floor(safe / 86_400);
  const hours = Math.floor((safe % 86_400) / 3_600);
  const minutes = Math.floor((safe % 3_600) / 60);
  const seconds = safe % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
