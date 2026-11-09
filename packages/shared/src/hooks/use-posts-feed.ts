'use client';

import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { feedService, postDtoToFeedItem } from '../services/feed.service';
import type { FeedItem, Paginated } from '../types/feed';
import {
  POSTS_FEED_QUERY_KEY,
  postsFeedKey,
  type PostsFeedFilters,
} from '../lib/posts-feed-key';

export { POSTS_FEED_QUERY_KEY, postsFeedKey, type PostsFeedFilters };

/** Infinite list of posts for the home feed. */
export function usePostsFeed(filters: PostsFeedFilters = {}) {
  const limit = filters.limit ?? 20;
  const key = postsFeedKey(filters);

  const query = useInfiniteQuery<Paginated<Extract<FeedItem, { kind: 'post' }>>>({
    queryKey: key,
    queryFn: async ({ pageParam }) => {
      const page = await feedService.listPosts({ cursor: pageParam as string | undefined, limit });
      return {
        items: page.items.map(postDtoToFeedItem),
        nextCursor: page.nextCursor ?? null,
        sample: page.sample,
      };
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: filters.following !== null && filters.enabled !== false,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });

  // Stable between renders, so lists built from it can memoize.
  const items = useMemo(
    () => (query.data?.pages ?? []).flatMap((p) => p.items),
    [query.data],
  );

  return {
    items,
    sample: !!query.data?.pages[0]?.sample,
    isLoading: query.isPending,
    isError: query.isError,
    hasNextPage: !!query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    isFetchNextPageError: query.isFetchNextPageError,
    refetch: query.refetch,
  };
}
