'use client';

import { useQuery } from '@tanstack/react-query';

import { getNearClaimable, getNearUsdcBalance } from '@/lib/near/contract';
import { useNearWallet } from '@/store/near-wallet.store';

/** The connected account's tUSDC and what the contract is holding for it. */
export function useNearFunds() {
  const accountId = useNearWallet((s) => s.accountId);

  return useQuery({
    queryKey: ['near', 'balance', accountId],
    enabled: !!accountId,
    refetchInterval: 15_000,
    staleTime: 5_000,
    queryFn: async () => {
      const [usdc, claimable] = await Promise.all([
        getNearUsdcBalance(accountId as string),
        getNearClaimable(accountId as string),
      ]);
      return { usdc, claimable };
    },
  });
}
