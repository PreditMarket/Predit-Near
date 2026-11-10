import type { ReactNode } from 'react';

import { cents, fmtTokenAmount, usd2, usdSmart } from './formatters';
import type { BuyPreview, SellPreview } from './use-trade-preview';

export interface ResultTextArgs {
  mode: 'buy' | 'sell';
  isV3: boolean;
  buyPreview: BuyPreview | null;
  sellPreview: SellPreview | null;
  sideLabel: string;
  /** The other side, whose bets pay a winner's profit. */
  oppositeSideLabel?: string;
  collateralSymbol: string;
  /** Cost basis for the active side (0..1). Zero if unknown. */
  avgCost: number;
  /** USD amount the user typed (buy only). */
  amountUsd: number;
}

export interface ResultTexts {
  paymentText: ReactNode;
  payoutText: string;
  metricLabel: string;
  metricValue: string;
  metricRoi?: string;
  /** One line under the metric, when its value needs explaining. */
  metricHint?: string;
  negative: boolean;
}

/** Compose the copy that appears inside the ResultPanel — payment narration,
 * payout figure, and the metric row (profit or realized P&L). */
export function deriveResultTexts(a: ResultTextArgs): ResultTexts {
  const paymentText = derivePaymentText(a);
  const payoutText =
    a.mode === 'sell' && a.sellPreview
      ? usdSmart(a.sellPreview.netUsd)
      : a.mode === 'buy' && a.buyPreview
        ? usdSmart(a.buyPreview.payoutIfWin)
        : '$0';

  if (a.mode === 'sell') {
    if (!a.sellPreview) {
      return {
        paymentText,
        payoutText,
        metricLabel: 'Realized P&L',
        metricValue: '—',
        metricRoi: undefined,
        negative: false,
      };
    }
    const pnl = a.sellPreview.realizedPnl;
    const negative = pnl < 0;
    const sign = pnl >= 0 ? '+' : '−';
    return {
      paymentText,
      payoutText,
      metricLabel: a.isV3 ? 'Realized P&L' : 'You receive',
      metricValue: a.isV3
        ? `${sign}${usd2(Math.abs(pnl))}`
        : usd2(a.sellPreview.netUsd),
      metricRoi: a.isV3
        ? `${sign}${Math.abs(Math.round(a.sellPreview.roi))}%`
        : undefined,
      negative,
    };
  }

  if (!a.buyPreview) {
    return {
      paymentText,
      payoutText,
      metricLabel: 'Potential profit',
      metricValue: '—',
      metricRoi: undefined,
      negative: false,
    };
  }
  // V3 payout depends on opposite-side liquidity. When no losers exist yet
  // (or bonus < fee), projected profit can land ≤ 0 — show a dash instead of
  // "+$-x.xx". Matches the Advance panel's Max profit tile behavior.
  // A winner's profit is the losing side's money, so with no bets (or only
  // small ones) against this side there is nothing to win yet: say so, as a
  // bare dash read as broken.
  const profit = a.buyPreview.potentialProfit;
  const hasProfit = profit > 0;
  const other = a.oppositeSideLabel ?? 'the other side';
  return {
    paymentText,
    payoutText,
    metricLabel: 'Potential profit',
    metricValue: hasProfit ? `+${usd2(profit)}` : '$0 so far',
    metricRoi: hasProfit ? `+${Math.round(a.buyPreview.roi)}%` : undefined,
    metricHint: hasProfit
      ? undefined
      : `Winners split the ${other} bets, and there are too few yet. Profit grows as people bet ${other}.`,
    negative: false,
  };
}

function derivePaymentText(a: ResultTextArgs): ReactNode {
  if (a.mode === 'sell') {
    if (a.isV3 && a.avgCost > 0) {
      return (
        <>
          Cost basis{' '}
          <span className="font-bold text-foreground">{cents(a.avgCost)}</span>
        </>
      );
    }
    const shares = a.sellPreview?.sharesIn ?? 0;
    return (
      <>
        Selling{' '}
        <span className="font-bold text-foreground">
          {fmtTokenAmount(shares, a.sideLabel)} {a.sideLabel}
        </span>
      </>
    );
  }
  return `Using $${a.amountUsd.toFixed(2)} ${a.collateralSymbol} to buy shares`;
}
