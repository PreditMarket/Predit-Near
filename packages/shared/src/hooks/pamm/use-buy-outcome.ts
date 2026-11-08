'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { useMutation } from '@tanstack/react-query';

import { usePammConnectedProgram } from './use-pamm-program';
import { usePammSwapSettlement } from './use-swap';
import { buyOutcome } from '@/services/pamm/buy-outcome';
import type { BuyOutcomeParams } from '@/services/pamm/buy-outcome';
import { toastTxSuccess } from '@/lib/pamm/tx-toast';
import { reportPammTxError } from '@/lib/pamm/report-tx-error';
import { trackSwapConfirmed, trackSwapFailed } from '@/lib/analytics';
import { useEnsureTradeGas } from '@/hooks/v2/use-ensure-trade-gas';
import { sendTradeTx } from '@/lib/v2/trade-confirm';
import { markFirstTrade } from '@/store/install-prompt.store';

export function useBuyOutcome(poolAddress: string) {
  const program = usePammConnectedProgram();
  const { publicKey } = useWallet();
  const settleSwap = usePammSwapSettlement(poolAddress);
  const ensureTradeGas = useEnsureTradeGas();

  return useMutation({
    mutationFn: async (args: Omit<BuyOutcomeParams, 'userPublicKey'>) => {
      if (!program || !publicKey) throw new Error('Wallet not connected');
      await ensureTradeGas(publicKey);
      const usdcIn =
        Number(args.usdcAmountIn) / 10 ** args.poolState.pool.collateralDecimals;
      return sendTradeTx(usdcIn, () =>
        buyOutcome(program, { ...args, userPublicKey: publicKey }),
      );
    },
    onSuccess: async (sig, args) => {
      toastTxSuccess('Buy confirmed', sig);
      markFirstTrade();
      const SCALE =
        10 **
        args.poolState.pool.collateralDecimals;
      await settleSwap({
        txSig: sig,
        side: `buy_${args.buySide}`,
        amountIn: args.usdcAmountIn.toString(),
        amountOut: args.expectedOutTotal.toString(),
        // USDC notional in; backend treats USDC volume as XP-equivalent.
        volumePxpEquivalent: Number(args.usdcAmountIn) / SCALE,
        traderAddress: publicKey?.toBase58() ?? '',
      });

      if (!publicKey) return;
      try {
        trackSwapConfirmed({
          market_id: poolAddress,
          side: args.buySide,
          action: 'buy',
          amount_usdc: Number(args.usdcAmountIn) / SCALE,
          tx_hash: sig,
        });
      } catch (err) {
        console.error('[pamm] trackSwapConfirmed failed:', err);
      }
    },
    onError: (err: Error, args) => {
      const SCALE = 10 ** args.poolState.pool.collateralDecimals;
      trackSwapFailed({
        market_id: poolAddress,
        side: args.buySide,
        action: 'buy',
        amount_usdc: Number(args.usdcAmountIn) / SCALE,
        error_message: err.message,
      });
      reportPammTxError(
        'Buy failed',
        {
          poolAddress,
          action: `buy_${args.buySide}`,
          wallet: publicKey?.toBase58(),
        },
        err,
      );
    },
  });
}
