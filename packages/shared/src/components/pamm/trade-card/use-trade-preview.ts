'use client';

import { useMemo } from 'react';

import type { BuyQuote } from '@/hooks/pamm/use-buy-quote';
import type { SellQuote } from '@/hooks/pamm/use-sell-quote';
import type { V3BuyQuote, V3SellQuote } from '@/hooks/pamm/use-v3-quote';
import type { NearSide as SwapSide } from '@/lib/near/types';

/** Minimum v3 pool snapshot needed to project the cost-weighted payout at
 * the current pool state. All units are raw atoms (collateral).
 *
 * Note: share counts are intentionally NOT here. On-chain payout is
 * cost-weighted (`payout = cost × pool_collateral / X_win`) — shares don't
 * feed the formula. See `pamm/pm-amm/src/business/redeem.rs`. */
export interface V3PayoutContext {
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
  isV3: boolean;
  v3Quote: V3BuyQuote | V3SellQuote | null;
  buyQuote: BuyQuote | null | undefined;
  /** V3 redeem fee (basis points) — deducted from payoutIfWin so the
   * "Potential profit" tile reflects actual net-of-fee take-home. */
  redeemFeeBps?: number;
  /** V3 side being bought — picks which side's cost-basis accumulator drives
   * the payout projection. Ignored on v1/v2. */
  buySide?: SwapSide;
  /** V3 pool state snapshot — projects payoutIfWin using the actual on-chain
   * cost-weighted formula (`payout = cost × pool_collateral / X_win`)
   * assuming market resolves at current state. Null on v1/v2 or when the
   * state isn't loaded yet (falls back to net collateral, i.e. no bonus). */
  v3Payout?: V3PayoutContext | null;
}

/** Reduce the raw quote (v3 or v1/v2) into the numbers the trade card renders
 * — headline payout, potential profit, ROI, min-received, fee, impact. */
export function useBuyPreview({
  amountRaw,
  scale,
  isV3,
  v3Quote,
  buyQuote,
  redeemFeeBps = 0,
  buySide,
  v3Payout = null,
}: BuyPreviewArgs): BuyPreview | null {
  return useMemo(() => {
    if (amountRaw === BigInt(0)) return null;
    if (isV3) {
      if (!v3Quote || v3Quote.kind !== 'buy') return null;
      const amtNum = Number(amountRaw) / scale;
      const sharesOutNum = Number(v3Quote.sharesOut) / scale;
      const netNum = Number(v3Quote.net) / scale;
      const redeemMult = Math.max(0, 1 - redeemFeeBps / 10_000);

      // Cost-weighted payout projection — mirrors on-chain `plan_redeem`:
      //   payout = winning_cost_acc × pool_collateral / resolved_x_win
      // Assume market resolves at current pool state WITH this buy applied:
      //   pool'   = pool + net
      //   X_win'  = X_win_before + net    (this buy's cost adds to winning side)
      //   bonus   = user_new_cost × (pool' − X_win') / X_win'
      //           = net × (pool − X_win_before) / (X_win_before + net)
      //   gross   = net + bonus
      // Shares don't feed the formula — see docstring on
      // `packages/shared/src/lib/pamm/v3-rules.ts::estimateV3Payout`.
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
      // trading fee). Matches v2's `effectivePrice = dx / totalOutReal`
      // semantics so the meter reads the same on both versions.
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
    }
    if (!buyQuote) return null;
    const amtNum = Number(amountRaw) / scale;
    const sharesOutNum = Number(buyQuote.amountOut) / scale;
    const payoutIfWin = sharesOutNum;
    const potentialProfit = payoutIfWin - amtNum;
    const roi = amtNum > 0 ? (potentialProfit / amtNum) * 100 : 0;
    return {
      avgPx: buyQuote.effectivePrice,
      sharesOut: sharesOutNum,
      minShares: Number(buyQuote.minOut) / scale,
      feeUsd: Number(buyQuote.feeTotal) / scale,
      impactPct: buyQuote.priceImpact * 100,
      payoutIfWin,
      potentialProfit,
      roi,
    };
  }, [amountRaw, scale, isV3, v3Quote, buyQuote, redeemFeeBps]);
}

interface SellPreviewArgs {
  amountRaw: bigint;
  scale: number;
  isV3: boolean;
  v3Quote: V3BuyQuote | V3SellQuote | null;
  sellQuote: SellQuote | null | undefined;
  /** V3 cost basis for the active side (0..1 price). Zero when unknown. */
  avgCost: number;
  redeemFeeBps?: number;
}

export function useSellPreview({
  amountRaw,
  scale,
  isV3,
  v3Quote,
  sellQuote,
  avgCost,
}: SellPreviewArgs): SellPreview | null {
  return useMemo(() => {
    if (amountRaw === BigInt(0)) return null;
    if (isV3) {
      if (!v3Quote || v3Quote.kind !== 'sell') return null;
      const netUsd = Number(v3Quote.net) / scale;
      const feeUsd = Number(v3Quote.fee) / scale;
      const sharesInNum = Number(v3Quote.sharesIn) / scale;
      const cost = sharesInNum * avgCost;
      const realizedPnl = netUsd - cost;
      const roi = cost > 0 ? (realizedPnl / cost) * 100 : 0;
      // Net effective sale price per share (post-fee) — parity with v2's
      // `effectivePrice = usdcReal / sellReal` semantics.
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
    }
    if (!sellQuote) return null;
    const netUsd = Number(sellQuote.usdcOut) / scale;
    const feeUsd = Number(sellQuote.feeTotal) / scale;
    const sharesInNum = Number(amountRaw) / scale;
    return {
      netUsd,
      feeUsd,
      minReceive: Number(sellQuote.minUsdcOut) / scale,
      realizedPnl: 0,
      roi: 0,
      avgPx: sellQuote.effectivePrice,
      impactPct: sellQuote.priceImpact * 100,
      sharesIn: sharesInNum,
    };
  }, [amountRaw, scale, isV3, v3Quote, sellQuote, avgCost]);
}
