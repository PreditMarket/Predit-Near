'use client';

import { useEffect } from 'react';
import { useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import BN from 'bn.js';

import { getPammAdapter } from '@/lib/pamm/adapters';
import type { NormalizedPoolStateV3 } from '@/lib/pamm/adapters/types';
import type {
  PammMarketVersion,
  PammPositionModel,
} from '@/services/pamm/market-be';
import { usePammProgram } from './use-pamm-program';

const DEFAULT_PUBLIC_KEY = new PublicKey('11111111111111111111111111111111');

export interface PoolStateResult {
  marketVersion: PammMarketVersion;
  positionModel: PammPositionModel;
  poolAddress: PublicKey;
  pool: {
    bump: number;
    initSeed: PublicKey;
    collateralMint: PublicKey;
    collateralDecimals: number;
    yesMint: PublicKey;
    noMint: PublicKey;
    lpMint: PublicKey;
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
    creator: PublicKey;
    creatorShareBps: number;
    cancelled: boolean;
  };
  yesVaultBalance: bigint;
  noVaultBalance: bigint;
  collateralVaultBalance: bigint;
  priceYes: number;
  lEffective: number;
  /**
   * v3-only fields. `yesVaultBalance`/`noVaultBalance` carry share counts for
   * v3 and `totalLpSupply` is always 0 — read this for anything that needs the
   * real v3 numbers (cost basis, fee split, freeze window, resolve time).
   */
  v3?: NormalizedPoolStateV3;
}

function toBn(value: bigint | number): BN {
  return new BN(value.toString());
}

function resolutionCodeFromOutcome(outcome: 'yes' | 'no' | undefined): number {
  if (outcome === 'yes') return 1;
  if (outcome === 'no') return 2;
  return 0;
}

export function usePoolState(
  poolAddress: string | null | undefined,
  marketVersion: PammMarketVersion | null | undefined,
) {
  const { connection } = useConnection();
  const program = usePammProgram();
  const queryClient = useQueryClient();

  // Push-based liveness: subscribe to the account that moves on a trade and
  // refetch only when it actually changes, instead of polling every few
  // seconds. Both v2 and v3 keep the tradeable state (reserves / shares) on the
  // pool account itself. A slow safety-net poll (below) covers the case where
  // the RPC has no websocket endpoint.
  useEffect(() => {
    if (!poolAddress || !marketVersion) return;

    let watched: PublicKey[];
    try {
      watched = [new PublicKey(poolAddress)];
    } catch {
      return;
    }

    const invalidate = () =>
      queryClient.invalidateQueries({
        queryKey: ['pamm', 'pool', poolAddress, marketVersion],
      });

    const subIds = watched.map((key) =>
      connection.onAccountChange(key, invalidate, 'confirmed'),
    );

    return () => {
      subIds.forEach((id) => {
        void connection.removeAccountChangeListener(id);
      });
    };
  }, [poolAddress, marketVersion, connection, queryClient]);

  return useQuery({
    queryKey: ['pamm', 'pool', poolAddress, marketVersion],
    queryFn: async (): Promise<PoolStateResult> => {
      if (!poolAddress || !program || !marketVersion) {
        throw new Error('no pool address or market version');
      }

      const poolPubkey = new PublicKey(poolAddress);
      const adapter = getPammAdapter(marketVersion);
      const state = await adapter.getPoolState({
        program,
        connection,
        poolAddress: poolPubkey,
      });

      return {
        marketVersion: state.marketVersion,
        positionModel: state.positionModel,
        poolAddress: poolPubkey,
        pool: {
          bump: 0,
          initSeed: DEFAULT_PUBLIC_KEY,
          collateralMint: state.collateralMint,
          collateralDecimals: state.collateralDecimals,
          yesMint: state.yesMint ?? DEFAULT_PUBLIC_KEY,
          noMint: state.noMint ?? DEFAULT_PUBLIC_KEY,
          lpMint: state.lpMint ?? DEFAULT_PUBLIC_KEY,
          liquidityParamRaw: toBn(BigInt(Math.floor(state.lEffective))),
          liquidityParamInitialRaw: toBn(BigInt(Math.floor(state.lEffective))),
          createdTs: toBn(state.createdTs),
          expiryTs: toBn(state.expiryTs),
          tradingFeeBps: state.tradingFeeBps,
          lpShareBps: state.lpShareBps,
          feeSolAmount: toBn(state.feeSolAmount),
          isDynamic: state.isDynamic,
          resolutionCode: resolutionCodeFromOutcome(state.winningOutcome),
          totalLpSupply: toBn(state.totalLpSupply),
          seeded: state.seeded,
          creator: state.creator,
          creatorShareBps: state.creatorShareBps,
          cancelled: state.cancelled,
        },
        yesVaultBalance: state.yesReserve,
        noVaultBalance: state.noReserve,
        collateralVaultBalance: state.collateralReserve,
        priceYes: state.priceYes,
        lEffective: state.lEffective,
        v3: state.v3,
      };
    },
    enabled: !!poolAddress && !!program && !!marketVersion,
    staleTime: 5_000,
    // The onAccountChange subscription above drives live updates. Keep only a
    // slow safety-net poll for RPCs without a websocket endpoint, and pause it
    // when the tab is hidden.
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}
