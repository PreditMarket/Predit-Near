'use client';

import { useCallback, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  filterPositions,
  positionsCounts,
  type PositionsSort,
  type PositionsTab,
} from '@/lib/v2/portfolio-positions';
import { usePortfolioStore } from '@/store/portfolio.store';
import { usePositionViews } from './use-position-view';

/**
 * The PAMM positions store, filtered for one tab and paged on demand. The
 * filtering itself is `lib/v2/portfolio-positions` (unit tested); this only
 * wires the store and the paging to it.
 */
export function usePortfolioPositions({
  tab,
  search,
  sort,
}: {
  /** null for the tabs that aren't positions (raffles, markets, withdraw). */
  tab: PositionsTab | null;
  search: string;
  sort: PositionsSort;
}) {
  const { positions, openCount, loading, fetchNextPage } = usePortfolioStore(
    useShallow((s) => ({
      positions: s.positions,
      openCount: s.openCount,
      loading: s.loading,
      fetchNextPage: s.fetchNextPage,
    })),
  );

  const counts = useMemo(() => positionsCounts(positions, openCount), [positions, openCount]);
  const rows = useMemo(
    () => (tab ? filterPositions(positions, { tab, search, sort }) : []),
    [positions, tab, search, sort],
  );
  const views = usePositionViews(rows);

  // The store's first fetch is page 1; scrolling asks for 2, 3, …
  const [page, setPage] = useState(2);
  const [hasNextPage, setHasNextPage] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasNextPage) return;
    setLoadingMore(true);
    try {
      const result = await fetchNextPage(page);
      setHasNextPage(result.hasNextPage);
      setPage((p) => p + 1);
    } finally {
      setLoadingMore(false);
    }
  }, [fetchNextPage, hasNextPage, loadingMore, page]);

  return { views, counts, loading, hasNextPage, loadingMore, loadMore };
}
