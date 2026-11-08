import { create } from 'zustand';
import { UnifiedPosition, fetchPammPositions } from '@/services/unified-market.service';
import { getMyPammSummary, PammMarketSummary } from '@/services/pamm-market.service';

interface PortfolioState {
  positions: UnifiedPosition[];
  summary: PammMarketSummary | null;
  // derived from summary (fallback to 0 when summary not loaded).
  // NOTE: totalValue/totalPnL/sparkline are denominated in ONE collateral —
  // `summary.headlineSymbol` — not summed across all of them. Label them with
  // that symbol, and read `summary.byCollateral` for every currency.
  totalValue: number;
  totalPnL: number;
  openCount: number;
  winRate: number;
  wins: number;
  losses: number;
  sparkline: number[];
  hasPendingData: boolean;
  loading: boolean;
  summaryLoading: boolean;
  error: string | null;
  fetchAll: () => Promise<void>;
  fetchNextPage: (page: number) => Promise<{ hasNextPage: boolean }>;
  reset: () => void;
}

export const usePortfolioStore = create<PortfolioState>((set) => ({
  positions: [],
  summary: null,
  totalValue: 0,
  totalPnL: 0,
  openCount: 0,
  winRate: 0,
  wins: 0,
  losses: 0,
  sparkline: [],
  hasPendingData: false,
  loading: false,
  summaryLoading: false,
  error: null,

  async fetchAll() {
    set({ loading: true, summaryLoading: true, error: null });

    // Summary and first page of positions in parallel
    const [summaryResult, positionsResult] = await Promise.allSettled([
      getMyPammSummary(),
      fetchPammPositions({ page: 1, limit: 20 }),
    ]);

    if (summaryResult.status === 'fulfilled') {
      const s = summaryResult.value;
      set({
        summary: s,
        totalValue: s.totalValue,
        totalPnL: s.totalPnL,
        openCount: s.openCount,
        winRate: s.winRate,
        wins: s.wins,
        losses: s.losses,
        sparkline: s.sparkline,
        hasPendingData: s.hasPendingData,
        summaryLoading: false,
      });
    } else {
      set({ summaryLoading: false });
    }

    set({
      positions: positionsResult.status === 'fulfilled' ? positionsResult.value : [],
      loading: false,
      error: positionsResult.status === 'rejected' ? 'Failed to load positions' : null,
    });
  },

  async fetchNextPage(page: number) {
    const res = await fetchPammPositions({ page, limit: 20 });
    set((state) => ({ positions: [...state.positions, ...res] }));
    // hasNextPage derived from whether we got a full page
    return { hasNextPage: res.length === 20 };
  },

  reset() {
    set({
      positions: [],
      summary: null,
      totalValue: 0,
      totalPnL: 0,
      openCount: 0,
      winRate: 0,
      wins: 0,
      losses: 0,
      sparkline: [],
      hasPendingData: false,
      loading: false,
      summaryLoading: false,
      error: null,
    });
  },
}));
