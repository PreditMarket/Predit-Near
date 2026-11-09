'use client';

import { useQuery } from '@tanstack/react-query';

import { getNearMarketsForPosts } from '@/lib/near/contract';

/** The markets created from each post on the page, in one read. */
export function usePostMarkets(postIds: string[]) {
  const key = postIds.join(',');
  return useQuery({
    queryKey: ['near', 'post-markets', key],
    queryFn: () => getNearMarketsForPosts(key.split(',')),
    enabled: postIds.length > 0,
    staleTime: 5_000,
    refetchInterval: 15_000,
  });
}
