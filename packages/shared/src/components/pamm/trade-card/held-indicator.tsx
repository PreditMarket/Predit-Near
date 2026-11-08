'use client';

import type { SwapSide } from '@/services/pamm/swap';
import { cents, fmtTokenAmount } from './formatters';

interface HeldIndicatorProps {
  side: SwapSide;
  sideLabel: string;
  oppositeSideLabel: string;
  heldShares: number;
  closingShares: number;
  avgCost: number;
  onSwitchToBuyOpposite: () => void;
}

/** Sell-mode banner. Makes the v3 "sell = close existing position" rule
 * explicit — green-tinted EXIT copy when holding, red-tinted "Nothing to
 * sell" + Buy-opposite jump when not. Matches mockup pixel values. */
export function HeldIndicator({
  side,
  sideLabel,
  oppositeSideLabel,
  heldShares,
  closingShares,
  avgCost,
  onSwitchToBuyOpposite,
}: HeldIndicatorProps) {
  const sideCaps = sideLabel.toUpperCase();
  const oppoCaps = oppositeSideLabel.toUpperCase();

  if (heldShares > 0) {
    const closing = Math.max(0, Math.min(closingShares, heldShares));
    return (
      <div className="rounded-[8px] border border-success/[0.28] bg-success/[0.06] px-[10px] py-[8px] font-mono text-[11px] leading-[1.45] text-muted-foreground">
        <span className="text-faint">EXIT</span>{' '}
        Closing{' '}
        <span className="font-bold text-foreground">
          {fmtTokenAmount(closing, sideLabel)}
        </span>{' '}
        /{' '}
        <span className="font-bold text-foreground">
          {fmtTokenAmount(heldShares, sideLabel)} {sideCaps}
        </span>{' '}
        <span className="text-faint">held @ avg</span>{' '}
        <span className="font-bold text-foreground">{cents(avgCost)}</span>
      </div>
    );
  }

  return (
    <div
      className="rounded-[8px] border border-danger/[0.28] bg-danger/[0.05] px-[10px] py-[8px] font-mono text-[11px] leading-[1.45] text-muted-foreground"
      data-side={side}
    >
      <span className="font-bold text-danger">Nothing to sell on {sideCaps}.</span>{' '}
      <button
        type="button"
        onClick={onSwitchToBuyOpposite}
        className="cursor-pointer font-bold text-primary hover:underline"
      >
        Buy {oppoCaps} instead →
      </button>
    </div>
  );
}
