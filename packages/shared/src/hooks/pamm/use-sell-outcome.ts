'use client';

import { sellOnNear } from '@/lib/near/contract';
import type { NearSide } from '@/lib/near/types';
import type { PoolStateResult } from './use-pool-state';
import { useMarketTx } from './use-market-tx';

export interface SellOutcomeArgs {
  poolState: PoolStateResult;
  sellSide: NearSide;
  sellAmountIn: bigint;
  minUsdcOut: bigint;
  expectedUsdcOut: bigint;
}

export function useSellOutcome(poolAddress: string) {
  return useMarketTx(poolAddress, 'Sell confirmed', (args: SellOutcomeArgs) =>
    sellOnNear(poolAddress, args.sellSide, args.sellAmountIn, args.minUsdcOut),
  );
}
