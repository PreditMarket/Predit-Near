'use client';

import { Ghost } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { usePortfolioRedeem } from '@/hooks/pamm/use-portfolio-redeem';
import { useV3Position } from '@/hooks/pamm/use-v3-position';
import { useV3Refund } from '@/hooks/pamm/use-v3-refund';
import { useWalletGate } from '@/hooks/use-wallet-gate';
import { useGlobalPause } from '@/hooks/pamm/use-global-pause';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { PoolStateResult } from '@/hooks/pamm/use-pool-state';
import { USDC_DECIMALS, USDC_SYMBOL } from '@/lib/near/config';
import { formatCurrency } from '@/lib/pamm/format-currency';
import { estimateV3Payout } from '@/lib/pamm/v3-rules';

interface RedeemPanelProps {
  poolState: PoolStateResult;
  poolAddress: string;
  yesLabel?: string;
  noLabel?: string;
}

const SCALE = 10 ** USDC_DECIMALS;
const collateralSymbol = USDC_SYMBOL;

export function RedeemPanel({
  poolState,
  poolAddress,
  yesLabel = 'Yes',
  noLabel = 'No',
}: RedeemPanelProps) {
  const gate = useWalletGate();
  const isPaused = useGlobalPause();
  const redeem = usePortfolioRedeem(poolAddress);
  const refund = useV3Refund(poolAddress);
  const { data: position } = useV3Position(poolAddress);

  const fmt = (raw: bigint) =>
    (Number(raw) / SCALE).toLocaleString('en-US', { maximumFractionDigits: 4 });

  const { resolutionCode, v3 } = poolState;

  const winnerLabel =
    resolutionCode === 1
      ? yesLabel.toUpperCase()
      : resolutionCode === 2
        ? noLabel.toUpperCase()
        : null;
  const loserLabel =
    resolutionCode === 1 ? noLabel.toUpperCase() : yesLabel.toUpperCase();
  const winningBalance =
    resolutionCode === 1
      ? (position?.yes ?? BigInt(0))
      : (position?.no ?? BigInt(0));

  // The whole winning side is claimed at once, and it pays by cost, not 1:1.
  const winningCost =
    resolutionCode === 1
      ? (position?.yesCostAcc ?? BigInt(0))
      : (position?.noCostAcc ?? BigInt(0));
  const payout = estimateV3Payout(v3, winningCost);
  const usdcOut = payout?.net ?? BigInt(0);

  // A cancelled market pays everyone their cost back on both sides.
  if (poolState.cancelled && !winnerLabel) {
    const refundable =
      (position?.yesCostAcc ?? BigInt(0)) + (position?.noCostAcc ?? BigInt(0));
    if (refundable === BigInt(0)) return null;

    return (
      <Card className="gap-3 border-warning/30">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Claim Refund</CardTitle>
            <Badge className="bg-warning">CANCELLED</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            This market was cancelled without a result, so every position is
            refunded in full — no fee, both sides.
          </p>
          <div className="rounded-lg border p-3 text-xs flex justify-between">
            <span className="text-muted-foreground">
              You get back ({collateralSymbol})
            </span>
            <span className="font-mono">
              {formatCurrency(Number(refundable) / SCALE, collateralSymbol)}
            </span>
          </div>
          <Button
            className="w-full"
            onClick={gate.handleAction(() => refund.mutateAsync())}
            disabled={
              gate.walletReady ? refund.isPending : gate.connecting
            }
          >
            {gate.getCtaLabel(
              `Claim ${collateralSymbol} refund`,
              refund.isPending,
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!winnerLabel) return null;

  if (winningBalance === BigInt(0)) {
    return (
      <Card className="gap-3 border-border">
        <CardContent className="p-6 flex flex-col items-center gap-3 text-center text-sm text-muted-foreground">
          <Ghost className="h-8 w-8 opacity-40" />
          <p>Nothing to claim for {winnerLabel}.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="gap-3 border-success/30">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">Redeem</CardTitle>
          <Badge
            className={resolutionCode === 1 ? 'bg-success' : 'bg-danger'}
          >
            {winnerLabel} WON
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Claim your whole {winnerLabel} position in one go. You get back what
          you paid for it, plus a share of what the {loserLabel}{' '}
          side staked, split across every winning share.
        </p>

        <div className="text-xs">
          {winnerLabel} balance:{' '}
          <span className="font-mono text-foreground">
            {fmt(winningBalance)}
          </span>
        </div>

        <div className="rounded-lg border p-3 text-xs space-y-2">
          {payout && (
            <>
              <div className="flex justify-between text-muted-foreground">
                <span>Your cost basis</span>
                <span className="font-mono">
                  {formatCurrency(Number(winningCost) / SCALE, collateralSymbol)}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Share of the losing side</span>
                <span className="font-mono">
                  {formatCurrency(
                    Number(payout.gross - winningCost) / SCALE,
                    collateralSymbol,
                  )}
                </span>
              </div>
              {payout.fee > BigInt(0) && (
                <div className="flex justify-between text-muted-foreground">
                  <span>
                    Claim fee ({(v3.resolvedRedeemFeeBps / 100).toFixed(2)}%)
                  </span>
                  <span className="font-mono">
                    −{formatCurrency(Number(payout.fee) / SCALE, collateralSymbol)}
                  </span>
                </div>
              )}
            </>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              You receive ({collateralSymbol})
            </span>
            <span className="font-mono">
              {formatCurrency(Number(usdcOut) / SCALE, collateralSymbol)}
            </span>
          </div>
        </div>

        {(() => {
          const button = (
            <Button
              className="w-full"
              onClick={gate.handleAction(() => redeem.mutateAsync())}
              disabled={
                isPaused ||
                (gate.walletReady ? redeem.isPending : gate.connecting)
              }
            >
              {gate.getCtaLabel(
                isPaused ? 'Trading paused' : `Claim your ${winnerLabel} position`,
                redeem.isPending,
              )}
            </Button>
          );

          // A disabled button swallows pointer events, so the tooltip lives on
          // a wrapping span (which still receives hover) when paused.
          if (!isPaused) return button;
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="block">{button}</span>
              </TooltipTrigger>
              <TooltipContent>Trading paused</TooltipContent>
            </Tooltip>
          );
        })()}
      </CardContent>
    </Card>
  );
}
