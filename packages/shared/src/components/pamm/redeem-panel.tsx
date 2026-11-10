'use client';

import { Ghost } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useRedeem } from '@/hooks/pamm/use-redeem';
import { useUserBalances } from '@/hooks/pamm/use-user-balances';
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

import { useCollateralSymbol } from '@/hooks/pamm/use-collaterals';
import { formatCurrency } from '@/lib/pamm/format-currency';
import {
  formatClaimDelay,
  getClaimDelayRemaining,
  getClaimUnlockTs,
} from '@/lib/pamm/claim-delay';
import { estimateV3Payout } from '@/lib/pamm/v3-rules';

interface RedeemPanelProps {
  poolState: PoolStateResult;
  poolAddress: string;
  yesLabel?: string;
  noLabel?: string;
}

export function RedeemPanel({
  poolState,
  poolAddress,
  yesLabel = 'Yes',
  noLabel = 'No',
}: RedeemPanelProps) {
  const gate = useWalletGate();
  const isPaused = useGlobalPause();
  const redeem = useRedeem(poolAddress);
  const refund = useV3Refund(poolAddress);
  const { data: balances } = useUserBalances(
    poolAddress,
    poolState.marketVersion);
  const [amountStr, setAmountStr] = useState('');
  const [nowTs, setNowTs] = useState(() => Math.floor(Date.now() / 1000));

  const collateralDecimals = poolState.pool.collateralDecimals;
  const SCALE = 10 ** collateralDecimals;
  const fmt = (raw: bigint) =>
    (Number(raw) / SCALE).toLocaleString('en-US', { maximumFractionDigits: 4 });
  const parseRaw = (v: string): bigint => {
    const n = parseFloat(v);
    if (isNaN(n) || n <= 0) return BigInt(0);
    return BigInt(Math.round(n * SCALE));
  };

  const { pool } = poolState;
  const resolutionCode = pool.resolutionCode;
  const collateralSymbol = useCollateralSymbol(pool.collateralMint.toBase58());

  const isV3 = poolState.marketVersion === 'v3_shares';
  const v3 = poolState.v3;

  const winnerLabel =
    resolutionCode === 1
      ? yesLabel.toUpperCase()
      : resolutionCode === 2
        ? noLabel.toUpperCase()
        : null;
  const loserLabel =
    resolutionCode === 1 ? noLabel.toUpperCase() : yesLabel.toUpperCase();
  // v1/v2 unlock claims 24h after EXPIRY; v3 counts from when the market was
  // actually resolved, so a late resolution unlocks late.
  const claimBaseTs = isV3 && v3 ? v3.resolvedTs : pool.expiryTs.toNumber();
  // v3 carries its own delay on the pool (6h by default, seconds for quick
  // markets); v1/v2 are fixed at the program's 24h, so leave those undefined.
  const claimDelaySecs = isV3 && v3 ? v3.claimDelaySecs : undefined;
  const claimUnlockTs = getClaimUnlockTs(claimBaseTs, claimDelaySecs);
  const claimDelayRemaining = getClaimDelayRemaining(
    claimBaseTs,
    nowTs,
    claimDelaySecs,
  );
  const claimLocked = claimDelayRemaining > 0;
  const tokenOrPosition =
    poolState.marketVersion === 'v1_token' ? 'tokens' : 'positions';
  const winningBalance =
    resolutionCode === 1
      ? (balances?.yes ?? BigInt(0))
      : (balances?.no ?? BigInt(0));

  // v3 always claims the whole winning side — the program takes no amount — and
  // the payout is cost basis plus a slice of the losing side, not 1:1.
  const v3Position = useV3Position(poolAddress, pool.collateralMint, isV3);
  const v3WinningCost =
    resolutionCode === 1
      ? (v3Position.data?.yesCostAcc ?? BigInt(0))
      : (v3Position.data?.noCostAcc ?? BigInt(0));
  const v3Payout =
    isV3 && v3
      ? estimateV3Payout(v3, v3WinningCost)
      : null;

  const amountRaw = isV3
    ? winningBalance
    : amountStr
      ? parseRaw(amountStr)
      : winningBalance;
  const usdcOut = isV3 ? (v3Payout?.net ?? BigInt(0)) : amountRaw;

  useEffect(() => {
    if (!winnerLabel) return;
    const id = window.setInterval(() => {
      setNowTs(Math.floor(Date.now() / 1000));
    }, 1_000);
    return () => window.clearInterval(id);
  }, [winnerLabel]);

  const handleMax = () => {
    setAmountStr((Number(winningBalance) / SCALE).toFixed(collateralDecimals));
  };

  const handleRedeem = async () => {
    if (amountRaw === BigInt(0)) return;
    await redeem.mutateAsync({ poolState, amount: amountRaw });
    setAmountStr('');
  };

  // A cancelled v3 market pays everyone their cost basis back on both sides —
  // there is no winner, so the redeem flow above doesn't apply.
  if (isV3 && pool.cancelled && !winnerLabel) {
    const refundable =
      (v3Position.data?.yesCostAcc ?? BigInt(0)) +
      (v3Position.data?.noCostAcc ?? BigInt(0));
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
        {isV3 ? (
          <p className="text-xs text-muted-foreground">
            Claim your whole {winnerLabel} position in one go. You get back what
            you paid for it, plus a share of what the {loserLabel}{' '}
            side staked, split across every winning share.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Burn your {winnerLabel} {tokenOrPosition} to receive{' '}
            {collateralSymbol} at 1:1 rate. {loserLabel} {tokenOrPosition} are
            worthless — you can burn complete sets via the Liquidity tab to
            recover partial {collateralSymbol}.
          </p>
        )}

        <div className="text-xs">
          {winnerLabel} balance:{' '}
          <span className="font-mono text-foreground">
            {fmt(winningBalance)}
          </span>
        </div>

        {/* v3 has no partial claim — `redeem_v3` takes no amount. */}
        {!isV3 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Amount to redeem</span>
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                onClick={handleMax}
              >
                Max
              </Button>
            </div>
            <Input
              type="number"
              min="0"
              step="any"
              placeholder="0.00"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              className="font-mono"
              disabled={redeem.isPending}
            />
          </div>
        )}

        <div className="rounded-lg border p-3 text-xs space-y-2">
          {isV3 && v3 && v3Payout && (
            <>
              <div className="flex justify-between text-muted-foreground">
                <span>Your cost basis</span>
                <span className="font-mono">
                  {formatCurrency(Number(v3WinningCost) / SCALE, collateralSymbol)}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Share of the losing side</span>
                <span className="font-mono">
                  {formatCurrency(
                    Number(v3Payout.gross - v3WinningCost) / SCALE,
                    collateralSymbol,
                  )}
                </span>
              </div>
              {v3Payout.fee > BigInt(0) && (
                <div className="flex justify-between text-muted-foreground">
                  <span>
                    Claim fee ({(v3.resolvedRedeemFeeBps / 100).toFixed(2)}%)
                  </span>
                  <span className="font-mono">
                    −{formatCurrency(Number(v3Payout.fee) / SCALE, collateralSymbol)}
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

        {claimLocked && (
          <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
            Claims unlock in {formatClaimDelay(claimDelayRemaining)}.
            <span className="block text-warning/70">
              Unlock time: {new Date(claimUnlockTs * 1000).toLocaleString()}
              {/* v3 counts the delay from resolution, not from market close —
                  worth saying so the timer doesn't look wrong. */}
              {isV3 && ' · 24h after this market was resolved'}
            </span>
          </div>
        )}

        {(() => {
          const button = (
            <Button
              className="w-full"
              onClick={gate.handleAction(handleRedeem)}
              disabled={
                isPaused ||
                (gate.walletReady
                  ? amountRaw === BigInt(0) ||
                    amountRaw > winningBalance ||
                    claimLocked ||
                    redeem.isPending
                  : gate.connecting)
              }
            >
              {gate.getCtaLabel(
                isPaused
                  ? 'Trading paused'
                  : claimLocked
                    ? `Unlocks in ${formatClaimDelay(claimDelayRemaining)}`
                    : isV3
                      ? `Claim your ${winnerLabel} position`
                      : `Redeem ${winnerLabel} for ${collateralSymbol}`,
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
