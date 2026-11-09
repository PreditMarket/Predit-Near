'use client';

import { buyOnNear } from '@/lib/near/contract';
import type { NearSide } from '@/lib/near/types';
import type { PoolStateResult } from './use-pool-state';
import { useMarketTx } from './use-market-tx';

export interface BuyOutcomeArgs {
  poolState: PoolStateResult;
  buySide: NearSide;
  usdcAmountIn: bigint;
  minOutTotal: bigint;
  expectedOutTotal: bigint;
}

export function useBuyOutcome(poolAddress: string) {
  return useMarketTx(poolAddress, 'Buy confirmed', (args: BuyOutcomeArgs) =>
    buyOnNear(poolAddress, args.buySide, args.usdcAmountIn, args.minOutTotal),
  );
}
