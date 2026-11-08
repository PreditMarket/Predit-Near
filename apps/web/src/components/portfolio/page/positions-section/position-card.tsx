import type { ReactNode } from 'react';
import { MarketCell, PayoutCell, PriceCell, TradedCell, XpCell } from './position-cells';
import type { PositionView } from './use-position-view';

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="font-mono text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <div className="flex [&>*]:items-start [&>*]:text-left">{children}</div>
    </div>
  );
}

/** A position on a phone: the market, then its figures two by two. */
export function PositionCard({ view }: { view: PositionView }) {
  return (
    <div className="flex flex-col gap-3">
      <MarketCell view={view} />
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Figure label="Avg → Now">
          <PriceCell view={view} />
        </Figure>
        <Figure label="Traded">
          <TradedCell view={view} />
        </Figure>
        <Figure label="To win">
          <PayoutCell view={view} />
        </Figure>
        <Figure label="XP value">
          <XpCell view={view} />
        </Figure>
      </div>
    </div>
  );
}
