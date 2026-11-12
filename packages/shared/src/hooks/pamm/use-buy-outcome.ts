'use client';

import { buyOnNear } from '@/lib/near/contract';
import type { NearSide } from '@/lib/near/types';
import { useMarketTx } from './use-market-tx';

interface BuyOutcomeArgs {
  buySide: NearSide;
  usdcAmountIn: bigint;
  minOutTotal: bigint;
}

export function useBuyOutcome(poolAddress: string) {
  return useMarketTx(poolAddress, 'Buy confirmed', (args: BuyOutcomeArgs) =>
    buyOnNear(poolAddress, args.buySide, args.usdcAmountIn, args.minOutTotal),
  );
}
