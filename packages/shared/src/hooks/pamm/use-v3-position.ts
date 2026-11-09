'use client';

import { useQuery } from '@tanstack/react-query';

import type { NearAddress } from '@/lib/near/address';
import { getNearPosition, getNearUsdcBalance } from '@/lib/near/contract';
import { useNearWallet } from '@/store/near-wallet.store';

export interface V3PositionBalances {
  collateral: bigint;
  yes: bigint;
  no: bigint;
  lpShares: bigint;
  yesCostAcc: bigint;
  noCostAcc: bigint;
}

const EMPTY: V3PositionBalances = {
  collateral: BigInt(0),
  yes: BigInt(0),
  no: BigInt(0),
  lpShares: BigInt(0),
  yesCostAcc: BigInt(0),
  noCostAcc: BigInt(0),
};

/** The account's position with its cost basis, which is what payouts follow. */
export function useV3Position(
  poolAddress: string | null | undefined,
  _collateralMint: NearAddress | null | undefined,
  enabled = true,
) {
  const accountId = useNearWallet((s) => s.accountId);

  return useQuery({
    queryKey: ['pamm', 'v3Position', accountId, poolAddress],
    queryFn: async (): Promise<V3PositionBalances> => {
      if (!accountId || !poolAddress) return EMPTY;
      const [collateral, p] = await Promise.all([
        getNearUsdcBalance(accountId),
        getNearPosition(poolAddress, accountId),
      ]);
      return {
        collateral,
        yes: BigInt(p.yes_shares),
        no: BigInt(p.no_shares),
        lpShares: BigInt(0),
        yesCostAcc: BigInt(p.yes_cost),
        noCostAcc: BigInt(p.no_cost),
      };
    },
    enabled: enabled && !!accountId && !!poolAddress,
    staleTime: 3_000,
    refetchInterval: 10_000,
  });
}
