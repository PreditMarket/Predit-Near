'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Search } from 'lucide-react';
import { QuickTradeDialog } from '@/components/pamm/quick-trade-dialog';
import { getAllNearMarkets } from '@/lib/near/contract';
import { isTradable, nowSec, phaseLabel, phaseOf, safeHttpUrl, toPammMarket } from '@/lib/near/map';
import type { NearMarket, NearSide } from '@/lib/near/types';

type Tab = 'open' | 'ending' | 'settled' | 'all';

const TABS: { id: Tab; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'ending', label: 'Ending soon' },
  { id: 'settled', label: 'Settled' },
  { id: 'all', label: 'All' },
];

const SIDE_BUTTON =
  'flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 font-mono text-[12px] font-bold transition-colors';

const usdc = (raw: string) =>
  (Number(BigInt(raw)) / 1e6).toLocaleString('en-US', { maximumFractionDigits: 2 });

function timeLeft(expirySec: string): string {
  const left = Number(expirySec) - nowSec();
  if (left <= 0) return 'Ended';
  const days = Math.floor(left / 86_400);
  const hours = Math.floor((left % 86_400) / 3_600);
  if (days > 0) return `${days}d ${hours}h left`;
  const minutes = Math.floor((left % 3_600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m left` : `${minutes}m left`;
}

const settled = (m: NearMarket) => m.status === 'finalized' || m.status === 'cancelled';

function pick(markets: NearMarket[], tab: Tab): NearMarket[] {
  const newest = (a: NearMarket, b: NearMarket) => Number(b.id) - Number(a.id);
  switch (tab) {
    case 'open':
      return markets.filter((m) => phaseOf(m) === 'open').sort((a, b) => Number(BigInt(b.volume) - BigInt(a.volume)));
    case 'ending':
      return markets.filter((m) => phaseOf(m) === 'open').sort((a, b) => Number(a.rules.expiry_sec) - Number(b.rules.expiry_sec));
    case 'settled':
      return markets.filter(settled).sort(newest);
    case 'all':
      return [...markets].sort(newest);
  }
}

function NearMarketCard({ market }: { market: NearMarket }) {
  const [side, setSide] = useState<NearSide | null>(null);
  const yesPct = market.price_yes_bps / 100;
  const image = market.rules.image_url ? safeHttpUrl(market.rules.image_url) : null;

  return (
    <article data-testid="market-card" data-market={market.id} className="flex flex-col gap-3 rounded-[10px] border border-border bg-card p-3">
      <div className="flex gap-3">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- any host a creator names
          <img src={image} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-md object-cover" />
        ) : (
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
            <BarChart3 className="h-4 w-4" />
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center justify-between gap-2 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <span>{market.rules.category}</span>
            <span>{isTradable(market) ? timeLeft(market.rules.expiry_sec) : phaseLabel(market)}</span>
          </div>
          <Link prefetch={false} href={`/market/${market.id}`} className="line-clamp-2 text-[13px] font-semibold text-foreground hover:underline">
            {market.rules.question}
          </Link>
        </div>
      </div>

      {isTradable(market) ? (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" data-testid="market-card-yes" onClick={() => setSide('yes')} className={`${SIDE_BUTTON} border-success/30 bg-success/10 text-success hover:bg-success/20`}>
            <span className="truncate">{market.rules.yes_label}</span>
            <span>{yesPct.toFixed(0)}%</span>
          </button>
          <button type="button" data-testid="market-card-no" onClick={() => setSide('no')} className={`${SIDE_BUTTON} border-danger/30 bg-danger/10 text-danger hover:bg-danger/20`}>
            <span className="truncate">{market.rules.no_label}</span>
            <span>{(100 - yesPct).toFixed(0)}%</span>
          </button>
        </div>
      ) : (
        <span data-testid="market-card-phase" className="self-start rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {phaseLabel(market)}
        </span>
      )}

      <div className="flex items-center justify-between font-mono text-[11px] text-muted-foreground">
        <span>${usdc(market.volume)} volume</span>
        <span>{market.trades} trades</span>
      </div>

      {side && (
        <QuickTradeDialog market={toPammMarket(market)} open initialSide={side} onOpenChange={(open) => !open && setSide(null)} />
      )}
    </article>
  );
}

/** Every market on the contract, filtered here: the list is small enough to read whole. */
export function NearMarketList({
  categorySlug,
  gridColsClassName,
  headerLeadingSlot,
}: {
  categorySlug: string | null;
  gridColsClassName: string;
  headerLeadingSlot?: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>('open');
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(() => searchParams?.get('search') ?? '');
  const { data: markets, isLoading, isError, refetch } = useQuery({
    queryKey: ['near', 'all-markets'],
    queryFn: getAllNearMarkets,
    refetchInterval: 15_000,
  });

  const shown = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matching = (markets ?? []).filter(
      (m) => (!categorySlug || m.rules.category === categorySlug) && (!query || m.rules.question.toLowerCase().includes(query)),
    );
    return pick(matching, tab);
  }, [markets, categorySlug, search, tab]);

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border/60 bg-background/85 px-4 py-2 backdrop-blur">
        {headerLeadingSlot}
        <div role="tablist" className="flex gap-1">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              data-testid={`markets-tab-${id}`}
              onClick={() => setTab(id)}
              className={`rounded-md px-2.5 py-1 text-[13px] ${tab === id ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            data-testid="markets-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search markets"
            className="w-40 bg-transparent text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
      </div>

      <div className="p-4">
        {isLoading && <div className="h-40 animate-pulse rounded-[10px] bg-muted/40" aria-hidden />}
        {isError && (
          <p className="py-16 text-center text-[13px] text-muted-foreground">
            Could not read the markets.{' '}
            <button type="button" onClick={() => void refetch()} className="text-primary underline">
              Retry
            </button>
          </p>
        )}
        {markets && shown.length === 0 && (
          <p data-testid="markets-empty" className="py-16 text-center text-[13px] text-muted-foreground">
            No markets here yet. Create one from a post in the{' '}
            <Link href="/" className="text-primary underline">
              feed
            </Link>
            .
          </p>
        )}
        <div className={`grid gap-3 ${gridColsClassName}`}>
          {shown.map((market) => (
            <NearMarketCard key={market.id} market={market} />
          ))}
        </div>
      </div>
    </div>
  );
}
