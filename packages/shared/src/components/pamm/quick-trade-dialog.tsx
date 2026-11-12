'use client';

import { QuickTradeShell } from '@/components/shared/quick-trade-shell';
import { SwapPanel } from '@/components/pamm/swap-panel';
import { RedeemPanel } from '@/components/pamm/redeem-panel';
import { usePoolState } from '@/hooks/pamm/use-pool-state';
import type { PammMarket } from '@/services/pamm-market.service';
import type { NearSide as SwapSide } from '@/lib/near/types';

type TradeMode = 'buy' | 'sell';

interface QuickTradeDialogProps {
  market: PammMarket | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode?: TradeMode;
  initialSide?: SwapSide;
  /** Dollars to fill in for a buy. */
  presetAmountUsd?: number;
}

export function QuickTradeDialog({
  market,
  open,
  onOpenChange,
  initialMode = 'buy',
  initialSide = 'yes',
  presetAmountUsd,
}: QuickTradeDialogProps) {
  const poolAddress = market?.id ?? null;
  const { data: poolState, isLoading, isError } = usePoolState(open ? poolAddress : null);

  const yesPercent = poolState ? Math.round(poolState.priceYes * 100) : null;

  // Same gates as the market page, so this shortcut never offers a trade the contract would refuse.
  const resolutionCode = poolState?.resolutionCode ?? 0;
  const isResolved = resolutionCode !== 0;
  const isCancelled = !isResolved && !!poolState?.cancelled;
  const showRedeemPanel = isResolved || isCancelled;
  const isResolving =
    market?.status === 'pending_resolution' ||
    market?.status === 'pending_resolve_review';
  const yesLabel = market?.yesLabel?.trim() || 'Yes';
  const noLabel = market?.noLabel?.trim() || 'No';
  const resolvedOutcome = (
    resolutionCode === 1 ? yesLabel : noLabel
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
          onSuccess={() => onOpenChange(false)}
          standalone={false}
          yesLabel={market.yesLabel}
          noLabel={market.noLabel}
          cancelled={isCancelled}
          resolving={isResolving}
          presetAmountUsd={presetAmountUsd}
        />
      )}
    </QuickTradeShell>
  );
}
