import type { ReactNode } from 'react';

import { cents, fmtTokenAmount, usd2, usdSmart } from './formatters';
import type { BuyPreview, SellPreview } from './use-trade-preview';

export interface ResultTextArgs {
  mode: 'buy' | 'sell';
  buyPreview: BuyPreview | null;
  sellPreview: SellPreview | null;
  sideLabel: string;
  /** The other side, whose positions pay a winner's profit. */
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
      metricLabel: 'Realized P&L',
      metricValue: `${sign}${usd2(Math.abs(pnl))}`,
      metricRoi: `${sign}${Math.abs(Math.round(a.sellPreview.roi))}%`,
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
  // A winner's profit is the losing side's money, so with few positions against
  // this side there is nothing to win yet: say so rather than "+$-x.xx".
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
      : `Profit is paid from positions on ${other}, and there are too few yet. It grows as people take ${other}.`,
    negative: false,
  };
}

function derivePaymentText(a: ResultTextArgs): ReactNode {
  if (a.mode === 'sell') {
    if (a.avgCost > 0) {
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
          {fmtTokenAmount(shares)} {a.sideLabel}
        </span>
      </>
    );
  }
  return `Using $${a.amountUsd.toFixed(2)} ${a.collateralSymbol} to buy shares`;
}
