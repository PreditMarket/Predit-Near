'use client';

import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { refundV3 } from '@/lib/pamm/adapters/v3';
import { reportPammTxError } from '@/lib/pamm/report-tx-error';
import { toastTxSuccess } from '@/lib/pamm/tx-toast';

import { usePammConnectedProgram } from './use-pamm-program';

/**
 * `refund_v3` — the cancelled-market path. Returns the position's cost basis on
 * BOTH sides with no fee, unlike redeem which pays only the winning side minus
 * a claim fee. v3 only; v1/v2 have no equivalent instruction.
 */
export function useV3Refund(poolAddress: string) {
  const program = usePammConnectedProgram();
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!program || !publicKey) throw new Error('Wallet not connected');
      return refundV3({
        program,
        connection,
        poolAddress: new PublicKey(poolAddress),
        userPublicKey: publicKey,
      });
    },
    onSuccess: (sig) => {
      toastTxSuccess('Refund claimed', sig);
      qc.invalidateQueries({ queryKey: ['pamm', 'userBalances'] });
      qc.invalidateQueries({ queryKey: ['pamm', 'v3Position'] });
      qc.invalidateQueries({ queryKey: ['pamm', 'pool', poolAddress] });
    },
    onError: (err: Error) => {
      reportPammTxError(
        'Refund failed',
        { poolAddress, action: 'refund', wallet: publicKey?.toBase58() },
        err,
      );
    },
  });
}
