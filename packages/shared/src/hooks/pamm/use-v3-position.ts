'use client';

import { useQuery } from '@tanstack/react-query';

import { getNearPosition, getNearUsdcBalance } from '@/lib/near/contract';
import { useNearWallet } from '@/store/near-wallet.store';

export interface V3PositionBalances {
  /** The account's tUSDC in its wallet. */
  collateral: bigint;
  yes: bigint;
  no: bigint;
  yesCostAcc: bigint;
  noCostAcc: bigint;
}

/** The account's position with its cost basis, which is what payouts follow. */
export function useV3Position(poolAddress: string | null | undefined) {
  const accountId = useNearWallet((s) => s.accountId);

  return useQuery({
    queryKey: ['pamm', 'v3Position', accountId, poolAddress],
    queryFn: async (): Promise<V3PositionBalances> => {
      const [collateral, p] = await Promise.all([
        getNearUsdcBalance(accountId as string),
        getNearPosition(poolAddress as string, accountId as string),
      ]);
      return {
        collateral,
        yes: BigInt(p.yes_shares),
        no: BigInt(p.no_shares),
        yesCostAcc: BigInt(p.yes_cost),
        noCostAcc: BigInt(p.no_cost),
      };
    },
    enabled: !!accountId && !!poolAddress,
    staleTime: 3_000,
    refetchInterval: 10_000,
  });
}
