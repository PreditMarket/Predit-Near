'use client';

import { redeemOnNear } from '@/lib/near/contract';
import { useMarketTx } from './use-market-tx';

/** Claims the whole winning position; the contract takes no amount. */
export function usePortfolioRedeem(poolAddress: string) {
  return useMarketTx(poolAddress, 'Redeemed', (_: void) => redeemOnNear(poolAddress));
}
