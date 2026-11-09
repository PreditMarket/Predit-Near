'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { toastTxSuccess } from '@/lib/pamm/tx-toast';
import { usePortfolioStore } from '@/store/portfolio.store';

/** A signed market action: toast the result, then refresh what it changed. */
export function useMarketTx<Args>(
  poolAddress: string,
  successLabel: string,
  send: (args: Args) => Promise<string>,
) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: send,
    onSuccess: (hash) => {
      toastTxSuccess(successLabel, hash);
      void qc.invalidateQueries({ queryKey: ['pamm', 'pool', poolAddress] });
      void qc.invalidateQueries({ queryKey: ['pamm', 'market', poolAddress] });
      void qc.invalidateQueries({ queryKey: ['pamm', 'userBalances'] });
      void qc.invalidateQueries({ queryKey: ['pamm', 'v3Position'] });
      void qc.invalidateQueries({ queryKey: ['near'] });
      void usePortfolioStore.getState().fetchAll();
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}
