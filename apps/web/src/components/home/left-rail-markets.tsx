'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, ChevronLeft } from 'lucide-react';
import { ColumnBar, ColumnTitle } from '@/components/app-shell/column-bar';
import { QuickTradeDialog } from '@/components/pamm/quick-trade-dialog';
import { getAllNearMarkets } from '@/lib/near/contract';
import { isTradable, nowSec, phaseLabel, toPammMarket } from '@/lib/near/map';
import type { NearMarket } from '@/lib/near/types';

type Tab = 'hot' | 'new' | 'ending' | 'results';

const TABS: { id: Tab; label: string }[] = [
  { id: 'hot', label: 'Hot' },
  { id: 'new', label: 'New' },
  { id: 'ending', label: 'Ending' },
  { id: 'results', label: 'Results' },
];
const SHOWN = 30;
const RAIL =
  'sticky top-[calc(40px+var(--nav-y,0px))] h-[calc(var(--app-h)-40px-var(--banner-h,0px)-var(--nav-y,0px))] overflow-y-auto flex flex-col border-r border-border/60 bg-background/62 backdrop-blur-[20px] backdrop-saturate-[160%]';

function pick(markets: NearMarket[], tab: Tab): NearMarket[] {
  const open = markets.filter(isTradable);
  switch (tab) {
    case 'hot':
      return open.sort((a, b) => Number(BigInt(b.volume) - BigInt(a.volume)) || b.trades - a.trades);
    case 'new':
      return open.sort((a, b) => Number(b.id) - Number(a.id));
    case 'ending':
      return open.sort((a, b) => Number(a.rules.expiry_sec) - Number(b.rules.expiry_sec));
    case 'results':
      return markets.filter((m) => !isTradable(m) && m.status !== 'open').sort((a, b) => Number(b.id) - Number(a.id));
  }
}

function timeLeft(expirySec: string): string {
  const left = Number(expirySec) - nowSec();
  if (left <= 0) return 'ended';
  const days = Math.floor(left / 86_400);
  if (days > 0) return `${days}d`;
  const hours = Math.floor(left / 3_600);
  return hours > 0 ? `${hours}h` : `${Math.max(1, Math.floor(left / 60))}m`;
}

function Row({ market, onTrade }: { market: NearMarket; onTrade: (m: NearMarket) => void }) {
  const tradable = isTradable(market);
  const yes = market.price_yes_bps / 100;
  const body = (
    <>
      <span className="line-clamp-2 text-[12.5px] font-medium leading-snug text-foreground">{market.rules.question}</span>
      <span className="mt-1 flex items-center gap-2 font-mono text-[10.5px] text-muted-foreground">
        {tradable ? (
          <>
            <span className="text-success">
              {market.rules.yes_label} {yes.toFixed(0)}%
            </span>
            <span className="h-1 flex-1 overflow-hidden rounded-full bg-danger/30">
              <span className="block h-full bg-success/70" style={{ width: `${yes}%` }} />
            </span>
            <span>{timeLeft(market.rules.expiry_sec)}</span>
          </>
        ) : (
          <span className="font-bold uppercase tracking-wider">{phaseLabel(market)}</span>
        )}
      </span>
    </>
  );
  const row = 'flex w-full flex-col px-3 py-2.5 text-left transition-colors hover:bg-accent/40';
  return tradable ? (
    <button type="button" data-testid="rail-market" data-market={market.id} onClick={() => onTrade(market)} className={row}>
      {body}
    </button>
  ) : (
    <Link prefetch={false} href={`/market/${market.id}`} data-testid="rail-market" data-market={market.id} className={row}>
      {body}
    </Link>
  );
}

/** The left column: the contract's markets, one tap from a bet. */
export function LeftRailMarkets({ onCollapse }: { onCollapse: () => void }) {
  const [tab, setTab] = useState<Tab>('hot');
  const [trading, setTrading] = useState<NearMarket | null>(null);
  const { data: markets, isLoading } = useQuery({
    queryKey: ['near', 'all-markets'],
    queryFn: getAllNearMarkets,
    refetchInterval: 15_000,
  });
  const shown = useMemo(() => pick([...(markets ?? [])], tab).slice(0, SHOWN), [markets, tab]);

  return (
    <aside className={RAIL} aria-label="Markets" data-testid="left-rail">
      <ColumnBar className="gap-1.5">
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Collapse Markets"
          title="Collapse"
          className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-[5px] text-muted-foreground transition-colors hover:bg-accent/70 hover:text-white"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <ColumnTitle>Markets</ColumnTitle>
        <Link
          href="/markets"
          title="All markets"
          aria-label="All markets"
          className="ml-auto inline-flex h-[22px] w-[22px] items-center justify-center rounded-[5px] text-muted-foreground transition-colors hover:bg-accent/70 hover:text-white"
        >
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </ColumnBar>
      <div role="tablist" className="flex gap-1 border-b border-border/60 px-2 py-1.5">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            data-testid={`rail-tab-${id}`}
            onClick={() => setTab(id)}
            className={`rounded-md px-2 py-1 font-mono text-[11px] ${tab === id ? 'bg-accent/60 font-bold text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {isLoading && <div className="m-3 h-32 animate-pulse rounded-lg bg-muted/40" aria-hidden />}
      {markets && shown.length === 0 && (
        <p className="px-3 py-8 text-center text-[12px] text-muted-foreground">Nothing here yet.</p>
      )}
      <div className="flex flex-col divide-y divide-border/40">
        {shown.map((m) => (
          <Row key={m.id} market={m} onTrade={setTrading} />
        ))}
      </div>
      {trading && (
        <QuickTradeDialog
          market={toPammMarket(trading)}
          open
          initialSide="yes"
          preset={{ amountUsd: 5 }}
          onOpenChange={(open) => !open && setTrading(null)}
        />
      )}
    </aside>
  );
}
