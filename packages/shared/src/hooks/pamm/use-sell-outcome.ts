'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { useMutation } from '@tanstack/react-query';

import { usePammConnectedProgram } from './use-pamm-program';
import { usePammSwapSettlement } from './use-swap';
import { sellOutcome } from '@/services/pamm/sell-outcome';
import type { SellOutcomeParams } from '@/services/pamm/sell-outcome';
import { toastTxSuccess } from '@/lib/pamm/tx-toast';
import { reportPammTxError } from '@/lib/pamm/report-tx-error';
import { trackSwapConfirmed, trackSwapFailed } from '@/lib/analytics';
import { useEnsureTradeGas } from '@/hooks/v2/use-ensure-trade-gas';
import { sendTradeTx } from '@/lib/v2/trade-confirm';

export function useSellOutcome(poolAddress: string) {
  const program = usePammConnectedProgram();
  const { publicKey } = useWallet();
  const settleSwap = usePammSwapSettlement(poolAddress);
  const ensureTradeGas = useEnsureTradeGas();

  return useMutation({
    mutationFn: async (args: Omit<SellOutcomeParams, 'userPublicKey'>) => {
      if (!program || !publicKey) throw new Error('Wallet not connected');
      await ensureTradeGas(publicKey);
      const usdcOut =
        Number(args.expectedUsdcOut) /
        10 ** args.poolState.pool.collateralDecimals;
      return sendTradeTx(usdcOut, () =>
        sellOutcome(program, { ...args, userPublicKey: publicKey }),
      );
    },
    onSuccess: async (sig, args) => {
      toastTxSuccess('Sell confirmed', sig);
      const SCALE =
        10 **
        args.poolState.pool.collateralDecimals;
      await settleSwap({
        txSig: sig,
        side: `sell_${args.sellSide}`,
        amountIn: args.sellAmountIn.toString(),
        amountOut: args.expectedUsdcOut.toString(),
        // USDC notional out is the trade volume; backend treats it as XP-equivalent.
        volumePxpEquivalent: Number(args.expectedUsdcOut) / SCALE,
        traderAddress: publicKey?.toBase58() ?? '',
      });

      if (!publicKey) return;
      try {
        trackSwapConfirmed({
          market_id: poolAddress,
          side: args.sellSide,
          action: 'sell',
          amount_usdc: Number(args.minUsdcOut) / SCALE,
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
        side: args.sellSide,
        action: 'sell',
        amount_usdc: Number(args.minUsdcOut) / SCALE,
        error_message: err.message,
      });
      reportPammTxError(
        'Sell failed',
        {
          poolAddress,
          action: `sell_${args.sellSide}`,
          wallet: publicKey?.toBase58(),
        },
        err,
      );
    },
  });
}
