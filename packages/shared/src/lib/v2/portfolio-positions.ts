// The portfolio's positions list: which rows a tab shows, searched and sorted.
// Pure, so the page's hook only wires the store to it.
import type { UnifiedPosition } from '@/services/unified-market.service';

export type PositionsTab = 'open' | 'history' | 'resolved' | 'cancelled';
export type PositionsSort = 'recent' | 'value';

export const POSITIONS_SORTS: PositionsSort[] = ['recent', 'value'];

type Status = Pick<UnifiedPosition, 'status'>;

const statusOf = (p: Status) => p.status?.toLowerCase() ?? '';

const OPEN_STATUSES = ['open', 'active', 'pending', 'live'];
const SETTLED_STATUSES = ['won', 'lost', 'claimed'];

const isOpenPosition = (p: Status) => OPEN_STATUSES.includes(statusOf(p));
const isSettledPosition = (p: Status) => SETTLED_STATUSES.includes(statusOf(p));
const isCancelledPosition = (p: Status) => statusOf(p) === 'cancelled';

/** Rows in one tab. `history` (Trades) is every row. */
export function positionsInTab<T extends Status>(positions: T[], tab: PositionsTab): T[] {
  switch (tab) {
    case 'open':
      // Cancelled positions have their own tab, so they stay out of Open.
      return positions.filter(isOpenPosition);
    case 'resolved':
      return positions.filter(isSettledPosition);
    case 'cancelled':
      return positions.filter(isCancelledPosition);
    default:
      return positions;
  }
}

/** Case-insensitive match on the market question; blank matches everything. */
export function searchPositions<T extends Pick<UnifiedPosition, 'marketQuestion'>>(
  positions: T[],
  search: string,
): T[] {
  const q = search.trim().toLowerCase();
  if (!q) return positions;
  return positions.filter((p) => p.marketQuestion.toLowerCase().includes(q));
}

type Sortable = Pick<UnifiedPosition, 'createdAt' | 'amount'>;

const time = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
};

const amountOf = (p: Sortable) => {
  const n = Number(p.amount ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Newest first, or largest first by traded amount. Never mutates. */
export function sortPositions<T extends Sortable>(positions: T[], sort: PositionsSort): T[] {
  const rows = [...positions];
  if (sort === 'recent') return rows.sort((a, b) => time(b.createdAt) - time(a.createdAt));
  return rows.sort((a, b) => amountOf(b) - amountOf(a));
}

export function filterPositions<T extends Status & Sortable & Pick<UnifiedPosition, 'marketQuestion'>>(
  positions: T[],
  { tab, search, sort }: { tab: PositionsTab; search: string; sort: PositionsSort },
): T[] {
  return sortPositions(searchPositions(positionsInTab(positions, tab), search), sort);
}

export interface PositionsCounts {
  open: number;
  history: number;
  resolved: number;
  cancelled: number;
}

/**
 * Tab badges. The summary's `openCount` still counts cancelled rows (they keep
 * an `open` status), and they are listed in their own tab, so they come off it.
 */
export function positionsCounts(positions: Status[], summaryOpenCount: number): PositionsCounts {
  const cancelled = positions.filter(isCancelledPosition).length;
  return {
    open: Math.max(0, summaryOpenCount - cancelled),
    history: positions.length,
    resolved: positions.filter(isSettledPosition).length,
    cancelled,
  };
}
