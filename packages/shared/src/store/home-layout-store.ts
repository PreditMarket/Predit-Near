import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { PumpTab } from '@/lib/v2/pump';

/** The home's side columns; the center (social, or a trade) takes the rest. */
export type HomeColumnId = 'market' | 'pump' | 'ai';

/** Pixel bounds of each column's width, and where it starts. */
export const HOME_COLUMN_WIDTHS: Record<HomeColumnId, { min: number; max: number; initial: number }> = {
  market: { min: 220, max: 460, initial: 280 },
  pump: { min: 240, max: 520, initial: 300 },
  ai: { min: 240, max: 480, initial: 280 },
};

/** A folded column: a strip with its name and a button to open it again. */
export const HOME_FOLDED_WIDTH = 40;

interface HomeLayoutState {
  widths: Record<HomeColumnId, number>;
  folded: Record<HomeColumnId, boolean>;
  setWidth: (column: HomeColumnId, width: number) => void;
  resetWidth: (column: HomeColumnId) => void;
  setFolded: (column: HomeColumnId, folded: boolean) => void;
  /** The meme column's tab: New, Soon or Bonded. */
  pumpTab: PumpTab;
  setPumpTab: (tab: PumpTab) => void;
}

const PUMP_TABS: readonly PumpTab[] = ['new', 'soon', 'bonded'];

export const clampColumnWidth = (column: HomeColumnId, width: number) => {
  const { min, max, initial } = HOME_COLUMN_WIDTHS[column];
  if (!Number.isFinite(width)) return initial;
  return Math.round(Math.min(max, Math.max(min, width)));
};

const initialWidths = (): Record<HomeColumnId, number> => ({
  market: HOME_COLUMN_WIDTHS.market.initial,
  pump: HOME_COLUMN_WIDTHS.pump.initial,
  ai: HOME_COLUMN_WIDTHS.ai.initial,
});

/** localStorage that never throws (private windows, blocked storage). */
const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      return window.localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      window.localStorage.setItem(k, v);
    } catch {
      // Kept for this page only.
    }
  },
  removeItem: (k) => {
    try {
      window.localStorage.removeItem(k);
    } catch {
      // Nothing to remove.
    }
  },
};

/**
 * How the viewer arranged the home's columns, remembered in this browser.
 * Read back after mount (`skipHydration`): the server renders the initial
 * widths, so the first client render must too.
 */
export const useHomeLayoutStore = create<HomeLayoutState>()(
  persist(
    (set) => ({
      widths: initialWidths(),
      folded: { market: false, pump: false, ai: false },
      setWidth: (column, width) =>
        set((s) => ({ widths: { ...s.widths, [column]: clampColumnWidth(column, width) } })),
      resetWidth: (column) =>
        set((s) => ({ widths: { ...s.widths, [column]: HOME_COLUMN_WIDTHS[column].initial } })),
      setFolded: (column, folded) => set((s) => ({ folded: { ...s.folded, [column]: folded } })),
      pumpTab: 'new',
      setPumpTab: (pumpTab) => set({ pumpTab }),
    }),
    {
      name: 'deor.home-layout',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      skipHydration: true,
      partialize: (s) => ({ widths: s.widths, folded: s.folded, pumpTab: s.pumpTab }),
      // A stored width outside today's bounds (or a column added since) is
      // brought back within them.
      merge: (stored, current) => {
        const s = (stored ?? {}) as Partial<Pick<HomeLayoutState, 'widths' | 'folded' | 'pumpTab'>>;
        const widths = { ...current.widths };
        for (const id of Object.keys(widths) as HomeColumnId[]) {
          const w = s.widths?.[id];
          if (typeof w === 'number') widths[id] = clampColumnWidth(id, w);
        }
        const folded = { ...current.folded };
        for (const id of Object.keys(folded) as HomeColumnId[]) {
          if (typeof s.folded?.[id] === 'boolean') folded[id] = s.folded[id] as boolean;
        }
        const pumpTab = s.pumpTab && PUMP_TABS.includes(s.pumpTab) ? s.pumpTab : current.pumpTab;
        return { ...current, widths, folded, pumpTab };
      },
    },
  ),
);
