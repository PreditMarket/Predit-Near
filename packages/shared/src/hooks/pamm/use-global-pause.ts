'use client';

import { useQuery } from '@tanstack/react-query';

import { getPammGlobalPause } from '@/services/pamm-market.service';

/** The contract's pause switch, one cache entry shared by every trade and claim panel. */
export function useGlobalPause(): boolean {
  const { data } = useQuery({
    queryKey: ['pamm', 'global-pause'],
    queryFn: getPammGlobalPause,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
    staleTime: 30_000,
  });

  return data ?? false;
}
