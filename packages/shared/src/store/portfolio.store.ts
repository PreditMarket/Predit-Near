import { create } from 'zustand';
import { UnifiedPosition, fetchPammPositions } from '@/services/unified-market.service';
import { getMyPammSummary } from '@/services/pamm-market.service';

interface PortfolioState {
  positions: UnifiedPosition[];
  /** What the open and settled-but-unclaimed positions are worth, in tUSDC. */
  totalValue: number;
  openCount: number;
  winRate: number;
  wins: number;
  losses: number;
  loading: boolean;
  summaryLoading: boolean;
  error: string | null;
  fetchAll: () => Promise<void>;
  fetchNextPage: (page: number) => Promise<{ hasNextPage: boolean }>;
  reset: () => void;
}

const EMPTY = {
  positions: [],
  totalValue: 0,
  openCount: 0,
  winRate: 0,
  wins: 0,
  losses: 0,
  loading: false,
  summaryLoading: false,
  error: null,
};

export const usePortfolioStore = create<PortfolioState>((set) => ({
  ...EMPTY,

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
        totalValue: s.totalValue,
        openCount: s.openCount,
        winRate: s.winRate,
        wins: s.wins,
        losses: s.losses,
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
    set(EMPTY);
  },
}));
