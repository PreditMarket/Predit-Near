'use client';

import type { ReactNode } from 'react';

interface ResultPanelProps {
  /** Left side of the top row — payment narration. */
  paymentText: ReactNode;
  /** Right side of the top row — headline payout value (e.g. "$138"). */
  payoutText: string;
  /** Label of the bottom row — "Potential profit" / "Realized P&L". */
  metricLabel: string;
  /** Right side of the bottom row — value string (e.g. "+$38.12"). */
  metricValue: string;
  /** Compact ROI chip next to the value (e.g. "+38%"). */
  metricRoi?: string;
  /** One line under the metric explaining it. */
  metricHint?: string;
  /** True when the metric represents a loss on Sell — flips whole panel red. */
  negative?: boolean;
}

/** Combined "you pay → you receive" strip + P&L row. One container, dashed
 * divider between rows. Green tint /0.05 by default, red /0.05 on `negative`.
 * Values match mockup: hero label 10px uppercase 0.05em mute; value 16px
 * font-extrabold (800). */
export function ResultPanel({
  paymentText,
  payoutText,
  metricLabel,
  metricValue,
  metricRoi,
  metricHint,
  negative = false,
}: ResultPanelProps) {
  // Mockup uses base green #4ade80 (green-400) for tints.
  const containerCls = negative
    ? 'border-danger/[0.16] bg-danger/[0.05]'
    : 'border-success/[0.16] bg-success/[0.05]';
  const dividerCls = negative
    ? 'border-danger/[0.16]'
    : 'border-success/[0.16]';
  const payoutCls = negative ? 'text-danger' : 'text-success';
  const valueCls = negative ? 'text-danger' : 'text-success';
  const roiCls = negative
    ? 'bg-danger/[0.14] text-danger'
    : 'bg-success/[0.14] text-success';
  return (
    <div
      className={`flex flex-col gap-[6px] rounded-[10px] border px-[12px] py-[10px] font-mono ${containerCls}`}
    >
      <div className="flex items-center justify-between gap-[8px] text-[11.5px]">
        <span className="min-w-0 truncate font-semibold text-muted-foreground">
          {paymentText}
        </span>
        <span className="whitespace-nowrap font-bold text-foreground">
          →{' '}
          <span className={payoutCls}>{payoutText}</span>
        </span>
      </div>
      <div
        className={`flex items-center justify-between gap-[8px] border-t border-dashed pt-[6px] ${dividerCls}`}
      >
        <span className="font-bold uppercase tracking-[0.05em] text-[10px] text-faint">
          {metricLabel}
        </span>
        <span
          className={`flex items-baseline gap-[6px] whitespace-nowrap font-extrabold text-[16px] ${valueCls}`}
        >
          <span>{metricValue}</span>
          {metricRoi && (
            <span
              className={`rounded-[3px] px-[5px] py-[1px] font-mono text-[10px] font-bold ${roiCls}`}
            >
              {metricRoi}
            </span>
          )}
        </span>
      </div>
      {metricHint && (
        <p data-testid="result-metric-hint" className="font-sans text-[11px] leading-snug text-muted-foreground">
          {metricHint}
        </p>
      )}
    </div>
  );
}
