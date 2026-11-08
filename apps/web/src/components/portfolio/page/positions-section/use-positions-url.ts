'use client';

import { useEffect, useRef, useState } from 'react';
import type { MarketListKolStatus } from '@/components/market/market-list-kol';
import { POSITIONS_SORTS, type PositionsSort } from '@/lib/v2/portfolio-positions';

export type PortfolioTab =
  | 'open'
  | 'history'
  | 'resolved'
  | 'cancelled'
  | 'raffles'
  | 'my-markets'
  | 'withdraw';

const TABS: PortfolioTab[] = [
  'open',
  'history',
  'resolved',
  'cancelled',
  'raffles',
  'my-markets',
  'withdraw',
];
export const MARKET_STATUSES: MarketListKolStatus[] = [
  'all',
  'open',
  'closed',
  'resolved',
  'cancelled',
];

const pick = <T extends string>(value: string | null, allowed: readonly T[]) =>
  value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;

/**
 * The positions section's view — tab, sort, my-markets status and search —
 * kept in the URL (`?tab=history&sort=value&q=btc`) so a bookmarked or
 * shared portfolio opens on the same view. Read once on mount, written back
 * with `history.replaceState`; defaults are left out to keep the URL clean.
 */
export function usePositionsUrl() {
  const [tab, setTab] = useState<PortfolioTab>('open');
  const [sort, setSort] = useState<PositionsSort>('recent');
  const [search, setSearch] = useState('');
  const [marketsStatus, setMarketsStatus] = useState<MarketListKolStatus>('all');
  const [marketsSearch, setMarketsSearch] = useState('');
  const hydrated = useRef(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const t = pick(q.get('tab'), TABS);
    if (t) setTab(t);
    const s = pick(q.get('sort'), POSITIONS_SORTS);
    if (s) setSort(s);
    const ms = pick(q.get('mstatus'), MARKET_STATUSES);
    if (ms) setMarketsStatus(ms);
    const text = q.get('q');
    // One key for both searches, routed by the tab it opened on.
    if (text) (t === 'my-markets' ? setMarketsSearch : setSearch)(text);
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    const params = new URLSearchParams(window.location.search);
    const put = (key: string, value: string, fallback: string) => {
      if (value !== fallback) params.set(key, value);
      else params.delete(key);
    };
    put('tab', tab, 'open');
    put('sort', sort, 'recent');
    put('mstatus', marketsStatus, 'all');
    put('q', tab === 'my-markets' ? marketsSearch : search, '');
    params.delete('pnl'); // the old timeframe pills
    const qs = params.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
    if (next !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, '', next);
    }
  }, [tab, sort, search, marketsStatus, marketsSearch]);

  return {
    tab,
    setTab,
    sort,
    setSort,
    search,
    setSearch,
    marketsStatus,
    setMarketsStatus,
    marketsSearch,
    setMarketsSearch,
  };
}
