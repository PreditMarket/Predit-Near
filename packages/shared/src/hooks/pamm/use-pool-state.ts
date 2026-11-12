'use client';

import { useQuery } from '@tanstack/react-query';

import { getNearMarket } from '@/lib/near/contract';
import { toPoolState } from '@/lib/near/map';

/** The pool numbers the quote and payout maths read. Amounts are raw units. */
export interface NormalizedPoolStateV3 {
  yesShares: bigint;
  noShares: bigint;
  poolCollateral: bigint;
  virtualLiquidityL: bigint;
  /** Payout basis: sum of every position's cost on that side. */
  totalYesCostAcc: bigint;
  totalNoCostAcc: bigint;
  tradeFeeBps: number;
  /** Charged at redeem time, not on the trade. */
  redeemFeeBps: number;
  /** Trading is blocked for this many seconds before expiry. */
  tradeFreezeSeconds: number;
  /** Snapshot taken when the market settles; zero until then. */
  resolvedPoolCollateral: bigint;
  /** Winning side's total cost basis at settlement. */
  resolvedXWin: bigint;
  /** Redeem fee frozen at settlement, so it can't be raised afterwards. */
  resolvedRedeemFeeBps: number;
}

/** A contract market in the shape the trade panels read. */
export interface PoolStateResult {
  creator: string;
  createdTs: number;
  expiryTs: number;
  /** 0 while unsettled, 1 for YES, 2 for NO. */
  resolutionCode: number;
  /** Everyone is paid back: cancelled, invalid or one-sided. */
  cancelled: boolean;
  creatorShareBps: number;
  priceYes: number;
  v3: NormalizedPoolStateV3;
}

/** The market's pool. `poolAddress` is the contract's market id. */
export function usePoolState(poolAddress: string | null | undefined) {
  return useQuery({
    queryKey: ['pamm', 'pool', poolAddress],
    queryFn: async (): Promise<PoolStateResult> => {
      const market = await getNearMarket(poolAddress as string);
      if (!market) throw new Error('Market not found');
      return toPoolState(market);
    },
    enabled: !!poolAddress,
    refetchInterval: 5_000,
    staleTime: 2_000,
  });
}
