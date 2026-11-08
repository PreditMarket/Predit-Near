import { create } from 'zustand';

/** Where money is deposited to, or withdrawn from. `spot` is the spot wallet. */
export type FundsDeposit = 'spot' | 'phoenix' | 'lighter';
export type FundsWithdraw = 'spot' | 'phoenix' | 'lighter';

/**
 * What a money dialog is opened for. `FundsDialogHost` turns it into the one
 * dialog that does it:
 *
 * - `deposit` to spot (the default) is adding USDC from another chain; to a
 *   venue, the venue's deposit sheet (its "from spot wallet" tab moves the
 *   spot wallet's USDC in). `method` picks Lighter's source tab: sent on
 *   Arbitrum (`direct`) or bridged from the spot wallet (`spot`).
 * - `withdraw` from spot (the default) sends USDC out; from a venue, back to
 *   the spot wallet.
 */
export type FundsIntent =
  | { kind: 'deposit'; to?: FundsDeposit; method?: 'direct' | 'spot' }
  | { kind: 'withdraw'; from?: FundsWithdraw };

interface FundsDialogState {
  /** The dialog showing, if any. Opening another replaces it. */
  intent: FundsIntent | null;
  open: (intent: FundsIntent) => void;
  close: () => void;
}

/**
 * Every deposit and withdraw dialog, opened from anywhere through
 * this one store and mounted once (`FundsDialogHost` in the app layout).
 */
export const useFundsDialog = create<FundsDialogState>((set) => ({
  intent: null,
  open: (intent) => set({ intent }),
  close: () => set({ intent: null }),
}));
