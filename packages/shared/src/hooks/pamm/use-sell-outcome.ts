'use client';

import { sellOnNear } from '@/lib/near/contract';
import type { NearSide } from '@/lib/near/types';
import { useMarketTx } from './use-market-tx';

interface SellOutcomeArgs {
  sellSide: NearSide;
  sellAmountIn: bigint;
  minUsdcOut: bigint;
}

export function useSellOutcome(poolAddress: string) {
  return useMarketTx(poolAddress, 'Sell confirmed', (args: SellOutcomeArgs) =>
    sellOnNear(poolAddress, args.sellSide, args.sellAmountIn, args.minUsdcOut),
  );
}
