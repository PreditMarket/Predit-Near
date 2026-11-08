'use client';

import { useQuery } from '@tanstack/react-query';

import { getPammGlobalPause } from '@/services/pamm-market.service';

/**
 * Global trading-pause flag (whole exchange, NOT per-market).
 *
 * Now backed by the dedicated `GET /pamm-markets/global-pause` endpoint —
 * previously piggybacked on a `?limit=5` markets fetch. One tiny payload,
 * one react-query cache key shared by every consumer (banner, swap panel,
 * redeem panel), polled every 30s.
 */
export function useGlobalPause(): boolean {
  const { data } = useQuery({
    queryKey: ['pamm', 'global-pause'],
    queryFn: async () => {
      const res = await getPammGlobalPause();
      return res.isPaused;
    },
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
    staleTime: 30_000,
  });

  return data ?? false;
}
