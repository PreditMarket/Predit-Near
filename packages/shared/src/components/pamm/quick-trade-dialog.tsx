'use client';

import { QuickTradeShell } from '@/components/shared/quick-trade-shell';
import { SwapPanel } from '@/components/pamm/swap-panel';
import { RedeemPanel } from '@/components/pamm/redeem-panel';
import { usePoolState } from '@/hooks/pamm/use-pool-state';
import { useTradingBan } from '@/hooks/pamm/use-trading-ban';
import type { PammMarket } from '@/services/pamm-market.service';
import type { NearSide as SwapSide } from '@/lib/near/types';
import type { AutoSubmit } from '@/hooks/v2/use-auto-submit';

type TradeMode = 'buy' | 'sell';

interface QuickTradeDialogProps {
  market: PammMarket | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode?: TradeMode;
  initialSide?: SwapSide;
  /** A Predit AI chat card's order (plan 11): amount, sell share, chat limit. */
  preset?: { amountUsd?: number; sellPct?: number; maxUsd?: number; autoSubmit?: AutoSubmit };
  /** After a trade went through, with its tx (the chat card records it). */
  onTraded?: (txSig?: string) => void;
}

export function QuickTradeDialog({
  market,
  open,
  onOpenChange,
  initialMode = 'buy',
  initialSide = 'yes',
  preset,
  onTraded,
}: QuickTradeDialogProps) {
  const poolAddress = market?.id ?? null;
  const { data: poolState, isLoading, isError } = usePoolState(
    open ? poolAddress : null,
    market?.marketVersion ?? null,
  );
  const bannedFromTrading = useTradingBan(poolAddress ?? undefined, open);

  const yesPercent = poolState ? Math.round(poolState.priceYes * 100) : null;

  // A group candidate (or any market) can resolve/cancel independently —
  // mirrors pool-detail-layout's resolved/cancelled gate so this quick-trade
  // shortcut doesn't offer a swap the program would reject.
  const dbResolutionCode = market
    ? market.resolution === 'yes'
      ? 1
      : market.resolution === 'no'
        ? 2
        : 0
    : 0;
  const effectiveResolutionCode = poolState
    ? poolState.pool.resolutionCode !== 0
      ? poolState.pool.resolutionCode
      : dbResolutionCode
    : 0;
  const isResolved = effectiveResolutionCode !== 0;
  const isCancelled =
    !isResolved &&
    !!poolState &&
    (poolState.pool.cancelled || market?.status === 'cancelled');
  // V3's only cancelled-market reclaim path is refund_v3 (RedeemPanel) — sell
  // always reverts once cancelled (on-chain AlreadyCancelled). V1/V2
  // cancelled pools legitimately still take sells as the reclaim mechanism.
  const showRedeemPanel =
    isResolved || (isCancelled && poolState?.marketVersion === 'v3_shares');
  // Same halts as the market page: the backend refuses trades on a market
  // being resolved or paused by a trader petition, so don't let one be signed.
  const isResolving =
    market?.status === 'pending_resolution' ||
    market?.status === 'pending_resolve_review';
  const isTradingPaused = !!market?.tradingPausedAt && !isResolving;
  const yesLabel = market?.yesLabel?.trim() || 'Yes';
  const noLabel = market?.noLabel?.trim() || 'No';
  const resolvedOutcome = (
    effectiveResolutionCode === 1 ? yesLabel : noLabel
  ).toUpperCase();

  return (
    <QuickTradeShell
      open={open}
      onOpenChange={onOpenChange}
      question={market?.question}
      yesPercent={yesPercent}
      badge={
        <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest bg-warning/15 text-warning">
          Onchain
        </span>
      }
      isLoading={isLoading}
      isError={isError || (!isLoading && !poolState && open && !!poolAddress)}
      errorMessage="Could not load this market. It may not exist."
    >
      {poolState && market && showRedeemPanel && (
        <div className="space-y-2">
          {isResolved && (
            <p className="px-1 text-xs font-semibold text-muted-foreground">
              This market resolved {resolvedOutcome}
            </p>
          )}
          <RedeemPanel
            poolState={poolState}
            poolAddress={market.id}
            yesLabel={market.yesLabel}
            noLabel={market.noLabel}
          />
        </div>
      )}
      {poolState && market && !showRedeemPanel && (
        <SwapPanel
          key={`${market.id}:${initialMode}:${initialSide}`}
          poolState={poolState}
          poolAddress={market.id}
          initialMode={initialMode}
          initialSide={initialSide}
          onSuccess={(txSig) => {
            onTraded?.(txSig);
            onOpenChange(false);
          }}
          standalone={false}
          yesLabel={market.yesLabel}
          noLabel={market.noLabel}
          cancelled={isCancelled}
          underReview={market.moderationStatus === 'under_review'}
          bannedFromTrading={bannedFromTrading}
          resolving={isResolving}
          tradingPaused={isTradingPaused}
          preset={preset}
        />
      )}
    </QuickTradeShell>
  );
}
