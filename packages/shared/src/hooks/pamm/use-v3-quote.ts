'use client';

import { useEffect, useState } from 'react';

import {
  cpmmBuyOut,
  cpmmFee,
  cpmmPriceYes,
} from '@/lib/pamm/cpmm';
import type { NormalizedPoolStateV3 } from '@/lib/pamm/adapters/types';
import type { SwapSide } from '@/services/pamm/swap';

/**
 * User's on-chain position — needed for Semantic B sell quote where
 * payout = proportional cost_removed (not curve gross).
 */
export interface UserPositionForQuote {
  yesShares: bigint;
  noShares: bigint;
  yesCostAcc: bigint;
  noCostAcc: bigint;
}

/**
 * Client-side v3 quote. Runs the same integer math as the program
 * (`lib/pamm/cpmm.ts` is a direct port), so the preview matches what lands
 * on-chain rather than approximating it in floating point the way the v1/v2
 * quotes do.
 *
 * The backend also exposes `GET /pamm-markets/:id/quote` with identical math.
 * We compute locally so the preview updates as the user types without a
 * network round-trip per keystroke; use the BE quote when you need a figure
 * the server has also seen (e.g. recording intent).
 *
 * Fees on v3 split two ways only — creator and platform. There are no LPs.
 */
export interface V3BuyQuote {
  kind: 'buy';
  /** Fee taken off the collateral before it hits the curve. */
  fee: bigint;
  /** Collateral actually swapped after the fee. */
  net: bigint;
  /** Shares received. */
  sharesOut: bigint;
  /** Slippage-adjusted `sharesOut`, passed on-chain as `min_out`. */
  minOut: bigint;
  feeCreator: bigint;
  feePlatform: bigint;
  pricePerShare: number;
  priceBefore: number;
  priceAfter: number;
  priceImpact: number;
}

export interface V3SellQuote {
  kind: 'sell';
  /** Shares burned. */
  sharesIn: bigint;
  /** Collateral off the curve, before the fee. */
  grossOut: bigint;
  fee: bigint;
  /** Collateral the user actually receives. */
  net: bigint;
  /** Slippage-adjusted `net`, passed on-chain as `min_out`. */
  minOut: bigint;
  feeCreator: bigint;
  feePlatform: bigint;
  pricePerShare: number;
  priceBefore: number;
  priceAfter: number;
  priceImpact: number;
}

export type V3Quote = V3BuyQuote | V3SellQuote;

function splitFee(
  fee: bigint,
  creatorShareBps: number,
): { feeCreator: bigint; feePlatform: bigint } {
  const feeCreator = (fee * BigInt(creatorShareBps)) / 10_000n;
  // Platform takes the remainder so the two always sum to `fee` exactly.
  return { feeCreator, feePlatform: fee - feeCreator };
}

function impactOf(before: number | null, after: number | null): number {
  if (before == null || after == null || before <= 0) return 0;
  return Math.abs(after - before) / before;
}

function computeBuy(
  v3: NormalizedPoolStateV3,
  creatorShareBps: number,
  side: SwapSide,
  collateralIn: bigint,
  slippageBps: number,
): V3BuyQuote | null {
  if (collateralIn <= 0n) return null;
  const { yesShares, noShares, virtualLiquidityL: l } = v3;

  const fee = cpmmFee(collateralIn, v3.tradeFeeBps);
  const net = collateralIn - fee;
  if (net <= 0n) return null;

  const sharesOut = cpmmBuyOut(yesShares, noShares, net, l, side);
  if (sharesOut <= 0n) return null;

  const newYes = side === 'yes' ? yesShares + sharesOut : yesShares;
  const newNo = side === 'no' ? noShares + sharesOut : noShares;
  const priceBefore = cpmmPriceYes(yesShares, noShares, l);
  const priceAfter = cpmmPriceYes(newYes, newNo, l);

  return {
    kind: 'buy',
    fee,
    net,
    sharesOut,
    minOut: (sharesOut * BigInt(10_000 - slippageBps)) / 10_000n,
    ...splitFee(fee, creatorShareBps),
    pricePerShare: Number(net) / Number(sharesOut),
    priceBefore: priceBefore ?? 0.5,
    priceAfter: priceAfter ?? 0.5,
    priceImpact: impactOf(priceBefore, priceAfter),
  };
}

/** A v3 sell of `sharesIn`, priced as the trade card prices it. */
export function computeSell(
  v3: NormalizedPoolStateV3,
  creatorShareBps: number,
  side: SwapSide,
  sharesIn: bigint,
  slippageBps: number,
  position: UserPositionForQuote | null,
): V3SellQuote | null {
  if (sharesIn <= 0n) return null;
  const { yesShares, noShares, virtualLiquidityL: l } = v3;

  // Can't burn more shares than the side has outstanding on-pool.
  const sideShares = side === 'yes' ? yesShares : noShares;
  if (sharesIn > sideShares) return null;

  // Semantic B (on-chain): payout = proportional cost basis, NOT curve gross.
  //   gross_out = user_cost × shares_in / user_shares
  // Curve is only the pricing signal for BUY. Sell is deterministic exit
  // at cost. Without the user's position we can't quote — return null so
  // the UI stays in "quoting" until position loads.
  if (!position) return null;
  const userShares = side === 'yes' ? position.yesShares : position.noShares;
  const userCost = side === 'yes' ? position.yesCostAcc : position.noCostAcc;
  if (userShares <= 0n || userCost <= 0n) return null;
  if (sharesIn > userShares) return null;

  const grossOut = (userCost * sharesIn) / userShares;
  if (grossOut <= 0n) return null;

  const fee = cpmmFee(grossOut, v3.tradeFeeBps);
  const net = grossOut - fee;
  if (net <= 0n) return null;

  const newYes = side === 'yes' ? yesShares - sharesIn : yesShares;
  const newNo = side === 'no' ? noShares - sharesIn : noShares;
  const priceBefore = cpmmPriceYes(yesShares, noShares, l);
  const priceAfter = cpmmPriceYes(newYes, newNo, l);

  return {
    kind: 'sell',
    sharesIn,
    grossOut,
    fee,
    net,
    minOut: (net * BigInt(10_000 - slippageBps)) / 10_000n,
    ...splitFee(fee, creatorShareBps),
    pricePerShare: Number(grossOut) / Number(sharesIn),
    priceBefore: priceBefore ?? 0.5,
    priceAfter: priceAfter ?? 0.5,
    priceImpact: impactOf(priceBefore, priceAfter),
  };
}

export interface V3QuoteState {
  /**
   * Last computed quote. May be one debounce interval behind the current
   * inputs — check `isQuoting` before using it for anything but display.
   */
  quote: V3Quote | null;
  /**
   * True while the debounce is still pending for the *current* inputs. Callers
   * must not submit a trade in this window: `minOut` would come from a stale
   * quote, or from nothing at all on the first keystroke.
   */
  isQuoting: boolean;
}

/**
 * Identity of the inputs a quote was computed from. Compared by VALUE, not by
 * object identity: the pool state is refetched on a timer, so `v3` is a new
 * object every few seconds even when nothing moved — keying off identity would
 * flash the button back into "quoting" on every poll.
 */
function quoteKey(
  v3: NormalizedPoolStateV3 | null | undefined,
  creatorShareBps: number,
  mode: 'buy' | 'sell',
  side: SwapSide,
  amountIn: bigint,
  slippageBps: number,
  position: UserPositionForQuote | null,
): string {
  if (!v3) return 'none';
  return [
    v3.yesShares,
    v3.noShares,
    v3.virtualLiquidityL,
    v3.tradeFeeBps,
    creatorShareBps,
    mode,
    side,
    amountIn,
    slippageBps,
    // position only matters for sell quote; include always to keep the key
    // deterministic and avoid stale cache on mode toggle.
    position?.yesShares ?? 0n,
    position?.noShares ?? 0n,
    position?.yesCostAcc ?? 0n,
    position?.noCostAcc ?? 0n,
  ].join(':');
}

/**
 * @param amountIn raw collateral atoms when buying, raw shares when selling.
 */
export function useV3Quote(
  v3: NormalizedPoolStateV3 | null | undefined,
  creatorShareBps: number,
  mode: 'buy' | 'sell',
  side: SwapSide,
  amountIn: bigint,
  slippageBps: number,
  position: UserPositionForQuote | null = null,
): V3QuoteState {
  const [state, setState] = useState<{ key: string; quote: V3Quote | null }>({
    key: 'none',
    quote: null,
  });

  const key = quoteKey(v3, creatorShareBps, mode, side, amountIn, slippageBps, position);

  useEffect(() => {
    if (!v3) {
      setState({ key: 'none', quote: null });
      return;
    }
    // Debounced to match the v1/v2 quote hooks so the summary doesn't thrash
    // while typing.
    const timer = setTimeout(() => {
      setState({
        key,
        quote:
          mode === 'buy'
            ? computeBuy(v3, creatorShareBps, side, amountIn, slippageBps)
            : computeSell(v3, creatorShareBps, side, amountIn, slippageBps, position),
      });
    }, 150);
    return () => clearTimeout(timer);
  }, [key, v3, creatorShareBps, mode, side, amountIn, slippageBps, position]);

  return {
    quote: state.quote,
    // Nothing to quote at zero — don't hold the button hostage before the user
    // has typed anything.
    isQuoting: amountIn > BigInt(0) && state.key !== key,
  };
}
