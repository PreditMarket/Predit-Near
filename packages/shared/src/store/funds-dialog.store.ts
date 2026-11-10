import { create } from 'zustand';

export type FundsDialog = 'deposit' | 'withdraw';

/** The money dialog on screen, opened from the balance pill or anywhere else. */
export const useFundsDialog = create<{
  shown: FundsDialog | null;
  open: (dialog: FundsDialog) => void;
  close: () => void;
}>((set) => ({
  shown: null,
  open: (dialog) => set({ shown: dialog }),
  close: () => set({ shown: null }),
}));
