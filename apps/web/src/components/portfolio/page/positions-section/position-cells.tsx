'use client';

import Link from 'next/link';
import { PammShareButton } from '@/components/pamm/share-button';
import { cn } from '@/components/ui/utils';
import { DASH } from '@/lib/format';
import { PammClaimRefundButton, PammRedeemButton } from './position-claim-buttons';
import { formatAmount, type PositionView } from './use-position-view';

const CHIP = 'text-[8.5px] px-1.5 py-0.5 rounded font-mono font-bold uppercase';
const PILL = 'px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase whitespace-nowrap';
const Dash = () => <span className="text-[11px] text-muted-foreground font-mono">{DASH}</span>;

/** Side and status chips, and a share button, over the question. */
export function MarketCell({ view }: { view: PositionView }) {
  const { position } = view;
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={cn(CHIP, view.sideClass)}>{view.sideLabel}</span>
        <span className={cn(CHIP, view.statusClass)}>{view.statusLabel}</span>
        {position.marketUrl && (
          <PammShareButton
            url={position.marketUrl}
            question={position.marketQuestion}
            side={view.sideLabel}
            size="sm"
            variant="icon"
          />
        )}
      </div>
      {position.marketUrl ? (
        <Link
          href={position.marketUrl}
          className="text-[13px] font-semibold leading-snug truncate text-foreground hover:underline"
        >
          {position.marketQuestion}
        </Link>
      ) : (
        <p className="text-[13px] font-semibold leading-snug truncate text-foreground">
          {position.marketQuestion}
        </p>
      )}
    </div>
  );
}

/** Entry odds → now, and the move since entry. */
export function PriceCell({ view }: { view: PositionView }) {
  const { entryPct, nowPct } = view;
  if (!view.showPrices || entryPct === null || nowPct === null) return <Dash />;
  const diff = nowPct - entryPct;
  return (
    <div className="flex flex-col items-end gap-0.5">
      <div className="flex items-center gap-1 text-[11px] font-mono">
        <span className="text-muted-foreground">{entryPct}%</span>
        <span className="text-muted-foreground mx-0.5">→</span>
        <span className="text-foreground font-bold">{nowPct}%</span>
      </div>
      <span
        className={cn(
          'text-[10px] font-mono',
          diff >= 0 ? 'text-success' : 'text-danger',
        )}
      >
        {diff >= 0 ? '+' : ''}
        {diff}% since entry
      </span>
    </div>
  );
}

export function TradedCell({ view }: { view: PositionView }) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="text-[12px] font-bold font-mono tabular-nums">{view.traded}</span>
      {view.shares !== null && (
        <span className="text-[10px] text-muted-foreground font-mono">{view.shares} shares</span>
      )}
    </div>
  );
}

/** Payout if right, or what to do now that it's settled: claim or refund. */
export function PayoutCell({ view }: { view: PositionView }) {
  const { payout, position } = view;
  const unit = position.unit ?? 'USDC';
  switch (payout.kind) {
    case 'claim':
      return (
        <div className="flex flex-col items-end gap-0.5">
          {payout.amount !== null && (
            <span className="text-[12px] font-bold font-mono text-success">
              {formatAmount(payout.amount, unit)}
            </span>
          )}
          <PammRedeemButton poolAddress={payout.trade.marketId} />
        </div>
      );
    case 'refund':
      return (
        <div className="flex flex-col items-end gap-0.5">
          {payout.amount !== null && (
            <span className="text-[12px] font-bold font-mono text-warning">
              {formatAmount(payout.amount, unit)}
            </span>
          )}
          <PammClaimRefundButton poolAddress={payout.trade.marketId} />
        </div>
      );
    case 'lost':
      return <span className={cn(PILL, 'bg-(--brand-danger-soft) text-danger')}>Wrong</span>;
    case 'claimed':
      return (
        <div className="flex flex-col items-end gap-0.5">
          {payout.amount !== null && (
            <span className="text-[12px] font-bold font-mono text-success">{formatAmount(payout.amount, unit)}</span>
          )}
          <span className={cn(PILL, 'bg-(--brand-success-soft) text-success')}>Claimed</span>
        </div>
      );
    case 'at-resolution':
      return (
        <span className="text-[10px] text-muted-foreground font-mono text-right leading-tight">
          Payout set
          <br />
          at resolution
        </span>
      );
  }
}
