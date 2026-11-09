'use client';

import { redeemOnNear } from '@/lib/near/contract';
import type { PammMarketVersion } from '@/services/pamm/market-be';
import { useMarketTx } from './use-market-tx';

export function usePortfolioRedeem(
  poolAddress: string,
  _tradeId: string,
  _marketVersion: PammMarketVersion = 'v3_shares',
) {
  return useMarketTx(poolAddress, 'Redeemed winnings', (_amountOut: string) =>
    redeemOnNear(poolAddress),
  );
}
