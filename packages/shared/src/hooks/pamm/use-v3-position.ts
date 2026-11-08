'use client';

import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { useQuery } from '@tanstack/react-query';

import { getV3UserBalances } from '@/lib/pamm/adapters/v3';
import type { V3PositionBalances } from '@/lib/pamm/adapters/v3';

import { usePammProgram } from './use-pamm-program';

const EMPTY: V3PositionBalances = {
  collateral: BigInt(0),
  yes: BigInt(0),
  no: BigInt(0),
  lpShares: BigInt(0),
  yesCostAcc: BigInt(0),
  noCostAcc: BigInt(0),
};

/**
 * v3 position including cost basis. `useUserBalances` drops `yesCostAcc` /
 * `noCostAcc` because v1/v2 have no equivalent, but the v3 payout is computed
 * from cost basis rather than share count — so anything showing a claim
 * estimate needs this instead.
 */
export function useV3Position(
  poolAddress: string | null | undefined,
  collateralMint: PublicKey | null | undefined,
  enabled = true,
) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const program = usePammProgram();

  return useQuery({
    queryKey: ['pamm', 'v3Position', publicKey?.toBase58(), poolAddress],
    queryFn: async (): Promise<V3PositionBalances> => {
      if (!publicKey || !poolAddress || !program) return EMPTY;
      return getV3UserBalances({
        program,
        connection,
        poolAddress: new PublicKey(poolAddress),
        userPublicKey: publicKey,
        knownMints: collateralMint ? { collateralMint } : undefined,
      });
    },
    enabled: enabled && !!publicKey && !!poolAddress && !!program,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}
