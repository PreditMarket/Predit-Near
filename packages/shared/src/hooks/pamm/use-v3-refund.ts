'use client';

import { refundOnNear } from '@/lib/near/contract';
import { useMarketTx } from './use-market-tx';

/** Returns the stake on both sides of a cancelled, invalid or one-sided market. */
export function useV3Refund(poolAddress: string) {
  return useMarketTx(poolAddress, 'Refund claimed', (_: void) => refundOnNear(poolAddress));
}
