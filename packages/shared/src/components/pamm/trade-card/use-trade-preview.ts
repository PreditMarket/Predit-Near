'use client';

import { useMemo } from 'react';

import type { V3BuyQuote, V3SellQuote } from '@/hooks/pamm/use-v3-quote';
import type { NearSide as SwapSide } from '@/lib/near/types';

/** Pool numbers that project the cost-weighted payout
 * (`payout = cost × pool_collateral / X_win`), raw units. Shares don't feed
 * it; see `contracts/core/src/business/redeem.rs`. */
interface V3PayoutContext {
  poolCollateral: bigint;
  totalYesCostAcc: bigint;
  totalNoCostAcc: bigint;
}

export interface BuyPreview {
  avgPx: number;
  sharesOut: number;
  minShares: number;
  feeUsd: number;
  impactPct: number;
  payoutIfWin: number;
  potentialProfit: number;
  roi: number;
}

export interface SellPreview {
  netUsd: number;
  feeUsd: number;
  minReceive: number;
  realizedPnl: number;
  roi: number;
  avgPx: number;
  impactPct: number;
  sharesIn: number;
}

interface BuyPreviewArgs {
  amountRaw: bigint;
  scale: number;
  v3Quote: V3BuyQuote | V3SellQuote | null;
  /** Redeem fee (basis points), taken off payoutIfWin so profit is net of it. */
  redeemFeeBps?: number;
  /** Side being bought: picks which side's cost basis drives the payout. */
  buySide?: SwapSide;
  /** Projects payoutIfWin as if the market settled now. Null while loading
   * (falls back to net collateral, i.e. no bonus). */
  v3Payout?: V3PayoutContext | null;
}

/** Reduce the raw quote into the numbers the trade card renders
 * — headline payout, potential profit, ROI, min-received, fee, impact. */
export function useBuyPreview({
  amountRaw,
  scale,
  v3Quote,
  redeemFeeBps = 0,
  buySide,
  v3Payout = null,
}: BuyPreviewArgs): BuyPreview | null {
  return useMemo(() => {
    if (amountRaw === BigInt(0)) return null;
    if (!v3Quote || v3Quote.kind !== 'buy') return null;
    const amtNum = Number(amountRaw) / scale;
    const sharesOutNum = Number(v3Quote.sharesOut) / scale;
    const netNum = Number(v3Quote.net) / scale;
    const redeemMult = Math.max(0, 1 - redeemFeeBps / 10_000);

    // Cost-weighted payout projection — mirrors the contract's `plan_redeem`:
    //   payout = winning_cost_acc × pool_collateral / resolved_x_win
    // Assume market resolves at current pool state WITH this buy applied:
    //   pool'   = pool + net
    //   X_win'  = X_win_before + net    (this buy's cost adds to winning side)
    //   bonus   = user_new_cost × (pool' − X_win') / X_win'
    //           = net × (pool − X_win_before) / (X_win_before + net)
    //   gross   = net + bonus
    let payoutIfWin: number;
    if (v3Payout && buySide) {
      const poolColl = Number(v3Payout.poolCollateral) / scale;
      const xWinBefore =
        buySide === 'yes'
          ? Number(v3Payout.totalYesCostAcc) / scale
          : Number(v3Payout.totalNoCostAcc) / scale;
      const loserPool = Math.max(0, poolColl - xWinBefore);
      const xWinAfter = xWinBefore + netNum;
      const bonus = xWinAfter > 0 ? (netNum * loserPool) / xWinAfter : 0;
      const gross = netNum + bonus;
      payoutIfWin = gross * redeemMult;
    } else {
      // No pool snapshot yet — no bonus can be projected. Show net stake
      // recovery (break-even) rather than the wildly-wrong shares-only fallback.
      payoutIfWin = netNum * redeemMult;
    }
    const potentialProfit = payoutIfWin - amtNum;
    const roi = amtNum > 0 ? (potentialProfit / amtNum) * 100 : 0;
    // True break-even: gross collateral paid ÷ shares received (includes
    // the trading fee).
    const avgPx = sharesOutNum > 0 ? amtNum / sharesOutNum : v3Quote.pricePerShare;
    return {
      avgPx,
      sharesOut: sharesOutNum,
      minShares: Number(v3Quote.minOut) / scale,
      feeUsd: Number(v3Quote.fee) / scale,
      impactPct: v3Quote.priceImpact * 100,
      payoutIfWin,
      potentialProfit,
      roi,
    };
  }, [amountRaw, scale, v3Quote, redeemFeeBps, buySide, v3Payout]);
}

interface SellPreviewArgs {
  amountRaw: bigint;
  scale: number;
  v3Quote: V3BuyQuote | V3SellQuote | null;
  /** Cost basis for the active side (0..1 price). Zero when unknown. */
  avgCost: number;
}

export function useSellPreview({
  amountRaw,
  scale,
  v3Quote,
  avgCost,
}: SellPreviewArgs): SellPreview | null {
  return useMemo(() => {
    if (amountRaw === BigInt(0)) return null;
    if (!v3Quote || v3Quote.kind !== 'sell') return null;
    const netUsd = Number(v3Quote.net) / scale;
    const feeUsd = Number(v3Quote.fee) / scale;
    const sharesInNum = Number(v3Quote.sharesIn) / scale;
    const cost = sharesInNum * avgCost;
    const realizedPnl = netUsd - cost;
    const roi = cost > 0 ? (realizedPnl / cost) * 100 : 0;
    // Net effective sale price per share, after the fee.
    const avgPx = sharesInNum > 0 ? netUsd / sharesInNum : v3Quote.pricePerShare;
    return {
      netUsd,
      feeUsd,
      minReceive: Number(v3Quote.minOut) / scale,
      realizedPnl,
      roi,
      avgPx,
      impactPct: v3Quote.priceImpact * 100,
      sharesIn: sharesInNum,
    };
  }, [amountRaw, scale, v3Quote, avgCost]);
}
