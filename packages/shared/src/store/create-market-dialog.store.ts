import { create } from 'zustand';

/** The create-market dialog: for one post, or open on the post picker when `postId` is null. */
export const useCreateMarketDialog = create<{
  open: boolean;
  postId: string | null;
  openFor: (postId: string | null) => void;
  close: () => void;
}>((set) => ({
  open: false,
  postId: null,
  openFor: (postId) => set({ open: true, postId }),
  close: () => set({ open: false, postId: null }),
}));
