'use client';

import { useQuery } from '@tanstack/react-query';

import { NearAddress } from '@/lib/near/address';
import { NEAR_MARKET_CONTRACT } from '@/lib/near/config';
import { nearView } from '@/lib/near/rpc';

type Roles = [owner: string, operator: string, arbiter: string, treasury: string, token: string];

/** The account allowed to post results on the market contract. */
export function useConfig() {
  return useQuery({
    queryKey: ['pamm', 'config'],
    queryFn: async () => {
      const [, operator] = await nearView<Roles>(NEAR_MARKET_CONTRACT, 'get_roles', {});
      return { resolver: new NearAddress(operator) };
    },
    staleTime: 10 * 60_000,
    gcTime: 10 * 60_000,
  });
}
