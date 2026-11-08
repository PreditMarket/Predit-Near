/**
 * Trading rules that exist only on v3 markets. Each one mirrors a specific
 * on-chain guard so the UI can explain the situation before the user signs,
 * instead of surfacing a raw program error afterwards.
 */
import type { NormalizedPoolStateV3 } from './adapters/types';

/**
 * `PoolTradeFrozen` — the program blocks trades once we are within
 * `trade_freeze_seconds` of expiry, so a market can't be traded on the back of
 * information that arrives right as it settles.
 */
export function getTradeFreezeStartTs(
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
 * Estimated `redeem_v3` payout for a winning position — cost-weighted
 * (uniform-ROI) parimutuel, matching on-chain `plan_redeem`:
 *
 *   lose_cost = resolved_pool_collateral − resolved_x_win
 *   bonus     = winning_cost_acc × lose_cost / resolved_x_win
 *   gross     = winning_cost_acc + bonus
 *             = winning_cost_acc × resolved_pool_collateral / resolved_x_win
 *   net       = gross − ceil(gross × resolved_redeem_fee_bps / 10_000)
 *
 * i.e. every winner earns identical ROI = `lose_cost / X_win`. Share count no
 * longer feeds the payout — the on-chain program docstring is explicit that
 * `resolved_win_shares` is telemetry only. Returns null until the pool is
 * resolved with a valid `resolved_x_win`.
 *
 * Note this uses `resolvedRedeemFeeBps` (frozen at resolve), not the live
 * `redeemFeeBps` — the program does the same so the fee can't be raised
 * between a user's buy and their claim.
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

  // Same u128-floor mul_div the program uses so client-side matches on-chain
  // to the atom. Ceil the fee to mirror `fee_ceil`.
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

/** Human "1h 20m" style countdown, reusing the claim-delay formatter shape. */
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
