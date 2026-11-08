'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Search as SearchIcon, Zap } from 'lucide-react';
import MarketListKol, { type MarketListKolStatus } from '@/components/market/market-list-kol';
import { PortfolioRaffles } from '@/components/portfolio/portfolio-raffles';
import { WithdrawLiquidityList } from '@/components/portfolio/withdraw-liquidity-list';
import { ResponsiveTable, SegmentedTabs, type SegmentedTabOption } from '@/components/v2';
import type { PositionsSort, PositionsTab } from '@/lib/v2/portfolio-positions';
import { useAuthStore } from '@/store/auth.store';
import { canCloneMarket, checkIsAdmin } from '@/utils/is-admin';
import { PositionCard } from './position-card';
import { POSITION_COLUMNS } from './position-columns';
import { SortMenu } from './sort-menu';
import { usePortfolioPositions } from './use-portfolio-positions';
import { MARKET_STATUSES, usePositionsUrl, type PortfolioTab } from './use-positions-url';

const SORT_OPTIONS: { value: PositionsSort; label: ReactNode }[] = [
  { value: 'recent', label: 'Recent' },
  { value: 'value', label: 'Value' },
  {
    value: 'xp',
    label: (
      <span className="inline-flex items-center gap-1">
        <Zap className="w-3 h-3" /> XP
      </span>
    ),
  },
];

const STATUS_LABEL: Record<MarketListKolStatus, string> = {
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
 * Positions and the account's other lists, one tab at a time. Raffles, my
 * markets and withdraw-liquidity mount — and fetch — only when their tab is
 * open.
 */
export function PositionsSection() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  // Anyone signed in can clone a market, so anyone can own one.
  const canSeeMyMarkets = canCloneMarket(user);
  const canSeeWithdraw = checkIsAdmin(user);
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
    { value: 'history', label: 'Trades', count: count(counts.history) },
    { value: 'resolved', label: 'Settled', count: count(counts.resolved) },
    ...(counts.cancelled > 0 || tab === 'cancelled'
      ? [{ value: 'cancelled' as const, label: 'Cancelled', count: count(counts.cancelled) }]
      : []),
    { value: 'raffles', label: 'Raffles' },
    ...(canSeeMyMarkets ? [{ value: 'my-markets' as const, label: 'Markets' }] : []),
    ...(canSeeWithdraw ? [{ value: 'withdraw' as const, label: 'Withdraw' }] : []),
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
        {tab === 'raffles' ? (
          <PortfolioRaffles />
        ) : myMarkets ? (
          <MarketListKol
            hideToolbar
            externalSearchTerm={url.marketsSearch}
            externalStatusFilter={url.marketsStatus}
          />
        ) : tab === 'withdraw' ? (
          <WithdrawLiquidityList />
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
