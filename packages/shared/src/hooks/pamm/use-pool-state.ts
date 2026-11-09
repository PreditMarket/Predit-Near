'use client';

import { useQuery } from '@tanstack/react-query';
import type BN from 'bn.js';

import type { NormalizedPoolStateV3 } from '@/lib/pamm/adapters/types';
import type { NearAddress } from '@/lib/near/address';
import { getNearMarket } from '@/lib/near/contract';
import { toPoolState } from '@/lib/near/map';
import type { PammMarketVersion, PammPositionModel } from '@/services/pamm/market-be';

export interface PoolStateResult {
  marketVersion: PammMarketVersion;
  positionModel: PammPositionModel;
  poolAddress: NearAddress;
  pool: {
    bump: number;
    initSeed: NearAddress;
    collateralMint: NearAddress;
    collateralDecimals: number;
    yesMint: NearAddress;
    noMint: NearAddress;
    lpMint: NearAddress;
    liquidityParamRaw: BN;
    liquidityParamInitialRaw: BN;
    createdTs: BN;
    expiryTs: BN;
    tradingFeeBps: number;
    lpShareBps: number;
    feeSolAmount: BN;
    isDynamic: boolean;
    resolutionCode: number;
    totalLpSupply: BN;
    seeded: boolean;
    creator: NearAddress;
    creatorShareBps: number;
    cancelled: boolean;
  };
  yesVaultBalance: bigint;
  noVaultBalance: bigint;
  collateralVaultBalance: bigint;
  priceYes: number;
  lEffective: number;
  v3?: NormalizedPoolStateV3;
}

/** The market's on-chain pool. `poolAddress` is the contract's market id. */
export function usePoolState(
  poolAddress: string | null | undefined,
  marketVersion: PammMarketVersion | null | undefined,
) {
  return useQuery({
    queryKey: ['pamm', 'pool', poolAddress, marketVersion],
    queryFn: async (): Promise<PoolStateResult> => {
      const market = await getNearMarket(poolAddress as string);
      if (!market) throw new Error('Market not found');
      return toPoolState(market);
    },
    enabled: !!poolAddress && !!marketVersion,
    refetchInterval: 5_000,
    staleTime: 2_000,
  });
}
