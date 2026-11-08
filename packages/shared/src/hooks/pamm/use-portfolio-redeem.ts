'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { useMutation } from '@tanstack/react-query';
import { PublicKey } from '@solana/web3.js';

import { usePammConnectedProgram } from './use-pamm-program';
import { redeemWinner } from '@/services/pamm/redeem-winner';
import { redeemTrade } from '@/services/pamm-market.service';
import {
  formatClaimDelay,
  getClaimDelayRemaining,
} from '@/lib/pamm/claim-delay';
import { toastTxSuccess } from '@/lib/pamm/tx-toast';
import { reportPammTxError } from '@/lib/pamm/report-tx-error';
import type { PammMarketVersion } from '@/services/pamm/market-be';
import { usePortfolioStore } from '@/store/portfolio.store';

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (
    value &&
    typeof (value as { toNumber?: () => number }).toNumber === 'function'
  ) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value);
}

function assertClaimUnlocked(expiryTsLike: unknown) {
  const remaining = getClaimDelayRemaining(toNumber(expiryTsLike));
  if (remaining <= 0) return;
  throw new Error(
    `ClaimDelayNotElapsed: claims unlock in ${formatClaimDelay(remaining)}`,
  );
}

export function usePortfolioRedeem(
  poolAddress: string,
  tradeId: string,
  marketVersion: PammMarketVersion = 'v2_position',
) {
  const program = usePammConnectedProgram();
  const { publicKey } = useWallet();
  const fetchAll = usePortfolioStore((s) => s.fetchAll);

  return useMutation({
    mutationFn: async (amountOut: string) => {
      if (!program || !publicKey) throw new Error('Wallet not connected');
      const poolPubkey = new PublicKey(poolAddress);

      // v3 claims the whole winning position in one `redeem_v3` — there is no
      // amount to pass, and the claim delay is enforced from `resolved_ts`
      // on-chain rather than from expiry.
      if (marketVersion === 'v3_shares') {
        const sig = await redeemWinner(
          program,
          { marketVersion: 'v3_shares', poolAddress: poolPubkey },
          BigInt(0),
          publicKey,
        );
        await redeemTrade(tradeId);
        return sig;
      }

      // v1 is wind-down only — `redeem_winner` is the one v1 instruction that
      // survived the v3 program release, so holders can still cash out.
      const pool =
        marketVersion === 'v1_token'
          ? await program.account.pool.fetch(poolPubkey)
          : await program.account.poolV2.fetch(poolPubkey);
      assertClaimUnlocked(pool.expiryTs);

      const sig = await redeemWinner(
        program,
        { marketVersion, poolAddress: poolPubkey },
        BigInt(amountOut),
        publicKey,
      );
      await redeemTrade(tradeId);
      return sig;
    },
    onSuccess: (sig) => {
      toastTxSuccess('Redeemed winnings', sig);
      fetchAll();
    },
    onError: (err: Error) => {
      reportPammTxError(
        'Redeem failed',
        { poolAddress, action: 'redeem', wallet: publicKey?.toBase58() },
        err,
      );
    },
  });
}
