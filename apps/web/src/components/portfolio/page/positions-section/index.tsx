'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Search as SearchIcon } from 'lucide-react';
import { ResponsiveTable, SegmentedTabs, type SegmentedTabOption } from '@/components/v2';
import type { PositionsSort, PositionsTab } from '@/lib/v2/portfolio-positions';
import { useNearWallet } from '@/store/near-wallet.store';
import { PositionCard } from './position-card';
import { POSITION_COLUMNS } from './position-columns';
import { SortMenu } from './sort-menu';
import { usePortfolioPositions } from './use-portfolio-positions';
import { CreatedMarkets } from './created-markets';
import { MARKET_STATUSES, usePositionsUrl, type CreatedMarketsFilter, type PortfolioTab } from './use-positions-url';

const SORT_OPTIONS: { value: PositionsSort; label: ReactNode }[] = [
  { value: 'recent', label: 'Recent' },
  { value: 'value', label: 'Value' },
];

const STATUS_LABEL: Record<CreatedMarketsFilter, string> = {
  all: 'All',
  open: 'Open',
  closed: 'Closed',
  resolved: 'Resolved',
  cancelled: 'Cancelled',
};

const EMPTY: Record<PositionsTab, [string, string]> = {
  open: ['No open positions', 'Start trading to fill your portfolio.'],
  history: ['No trades recorded yet', 'Your trade history will appear here.'],
  resolved: ['No settled positions yet', 'Your trade history will appear here.'],
  cancelled: ['No cancelled positions', 'Your trade history will appear here.'],
};

const isPositionsTab = (tab: PortfolioTab): tab is PositionsTab =>
  tab === 'open' || tab === 'history' || tab === 'resolved' || tab === 'cancelled';

/**
 * Positions and the markets this account created, one tab at a time.
 */
export function PositionsSection() {
  const router = useRouter();
  const canSeeMyMarkets = !!useNearWallet((s) => s.accountId);
  const url = usePositionsUrl();
  const { tab } = url;
  const positionsTab = isPositionsTab(tab) ? tab : null;
  const { views, counts, loading, hasNextPage, loadingMore, loadMore } = usePortfolioPositions({
    tab: positionsTab,
    search: url.search,
    sort: url.sort,
  });

  // Infinite scroll: the next page loads as the end of the list shows.
  const showSentinel = positionsTab !== null && !loading && views.length > 0;
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) void loadMore();
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore, showSentinel]);

  const count = (n: number) => (loading ? null : n);
  const tabs: SegmentedTabOption<PortfolioTab>[] = [
    { value: 'open', label: 'Open', count: count(counts.open) },
    { value: 'resolved', label: 'Settled', count: count(counts.resolved) },
    ...(counts.cancelled > 0 || tab === 'cancelled'
      ? [{ value: 'cancelled' as const, label: 'Cancelled', count: count(counts.cancelled) }]
      : []),
    ...(canSeeMyMarkets ? [{ value: 'my-markets' as const, label: 'Markets' }] : []),
  ];
  const myMarkets = tab === 'my-markets';
  const hasToolbar = positionsTab !== null || myMarkets;

  return (
    <section className="mt-6">
      <div className="pb-3 border-b border-border flex items-center gap-4">
        <SegmentedTabs
          variant="text"
          value={tab}
          onChange={url.setTab}
          options={tabs}
          className="min-w-0 flex-1"
          data-testid="portfolio-tabs"
        />
        {hasToolbar && (
          <div className="flex items-center gap-2 shrink-0">
            <label className="flex items-center gap-2 h-8 px-1.5 rounded-md text-muted-foreground focus-within:text-foreground transition-colors">
              <SearchIcon className="w-3.5 h-3.5" />
              <input
                aria-label="Search"
                placeholder="Search"
                value={myMarkets ? url.marketsSearch : url.search}
                onChange={(e) =>
                  (myMarkets ? url.setMarketsSearch : url.setSearch)(e.target.value)
                }
                className="bg-transparent border-0 outline-none text-foreground font-mono text-[11.5px] w-0 focus:w-28 sm:focus:w-40 transition-[width]"
              />
            </label>
            {myMarkets ? (
              <SortMenu
                title="Filter"
                value={url.marketsStatus}
                options={MARKET_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
                onChange={url.setMarketsStatus}
              />
            ) : (
              <SortMenu title="Sort by" value={url.sort} options={SORT_OPTIONS} onChange={url.setSort} />
            )}
          </div>
        )}
      </div>

      <div className="mt-4">
        {myMarkets ? (
          <CreatedMarkets search={url.marketsSearch} status={url.marketsStatus} />
        ) : (
          positionsTab && (
            <>
              <ResponsiveTable
                rows={views}
                columns={POSITION_COLUMNS}
                renderCard={(view) => <PositionCard view={view} />}
                getRowKey={(view) => view.position.id}
                loading={loading}
                onRowClick={(view) => {
                  if (view.position.marketUrl) router.push(view.position.marketUrl);
                }}
                rowTestId="position-row"
                cardTestId="position-card"
                empty={
                  <div className="py-8 space-y-2 font-sans">
                    <p className="font-mono text-[13px] uppercase tracking-[0.12em] text-foreground/80">
                      {EMPTY[positionsTab][0]}
                    </p>
                    <p className="text-[13px] text-muted-foreground">{EMPTY[positionsTab][1]}</p>
                  </div>
                }
              />
              {showSentinel && (
                <>
                  <div ref={sentinelRef} className="h-1" />
                  {loadingMore && hasNextPage && (
                    <div className="flex justify-center py-4">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </>
              )}
            </>
          )
        )}
      </div>
    </section>
  );
}
