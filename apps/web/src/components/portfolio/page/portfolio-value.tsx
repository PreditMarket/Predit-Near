'use client';

import { useState } from 'react';
import { Money, SegmentedTabs, StatTile } from '@/components/v2';
import type { PortfolioSummaryState } from '@/hooks/v2/use-portfolio-summary';
import {
  BlankLine,
  LineRow,
  PerpsLineRow,
  PnlCell,
  type LineStates,
} from './portfolio-value-lines';

type Group = 'spot' | 'perps';

const GROUPS = [
  { value: 'spot' as const, label: 'Spot & Predictions' },
  { value: 'perps' as const, label: 'Perps' },
];

const HEAD_TILE = 'px-3 py-2.5 bg-muted/20';

/**
 * The account's money, in two groups never added together: spot plus
 * prediction markets, or perps (one line per wallet, each a click from its
 * terminal). Both groups show the same four figures and are as tall as the
 * longer one, so toggling never moves the page. PnL is the engine's, so a
 * group's lines sum to its headline.
 */
export function PortfolioValue({ summary }: Readonly<{ summary: PortfolioSummaryState }>) {
  const [group, setGroup] = useState<Group>('spot');
  const { loading, pnlFailed } = summary;
  const head = group === 'spot' ? summary.spotPredictions : summary.perps;
  const valueLoading = group === 'spot' ? loading.spot || loading.pnl : loading.perps;
  const pnl = { loading: loading.pnl, failed: pnlFailed };

  const spotLines = 2;
  const perpsLines = summary.perps.venues.length;
  const rows = Math.max(spotLines, perpsLines);
  const shown = group === 'spot' ? spotLines : perpsLines;
  const lineStates = (valueLoadingFor: boolean): LineStates => ({
    valueLoading: valueLoadingFor,
    pnlLoading: loading.pnl,
    pnlFailed,
  });

  return (
    <div
      data-testid="portfolio-value"
      className="flex flex-col gap-3 px-4 py-3 rounded-lg bg-background/40 backdrop-blur-sm border border-border/50 min-w-0"
    >
      <SegmentedTabs value={group} onChange={setGroup} options={GROUPS} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatTile
          className={HEAD_TILE}
          label={group === 'perps' ? 'Equity' : 'Value'}
          loading={head.valueUsd === null && valueLoading}
          value={<Money value={head.valueUsd} exact />}
        />
        <StatTile
          className={HEAD_TILE}
          label="PnL"
          value={<PnlCell usd={head.realizedUsd + head.unrealizedUsd} {...pnl} />}
        />
        <StatTile
          className={HEAD_TILE}
          label="Realized"
          value={<PnlCell usd={head.realizedUsd} {...pnl} />}
        />
        <StatTile
          className={HEAD_TILE}
          label="Unrealized"
          value={<PnlCell usd={head.unrealizedUsd} {...pnl} />}
        />
      </div>

      {/* One grid for every line, so the columns line up across them. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-x-4 gap-y-2.5 border-t border-border/60 pt-2.5">
        <span />
        {[group === 'perps' ? 'Equity' : 'Value', 'Realized', 'Unrealized'].map((h) => (
          <span
            key={h}
            className="text-right font-mono text-[9px] font-medium tracking-[0.18em] uppercase text-muted-foreground"
          >
            {h}
          </span>
        ))}
        {group === 'spot' ? (
          <>
            <LineRow name="Spot" line={summary.spotPredictions.spot} {...lineStates(loading.spot)} />
            <LineRow
              name="Predictions"
              line={summary.spotPredictions.predictions}
              {...lineStates(loading.pnl)}
            />
          </>
        ) : (
          summary.perps.venues.map((line) => (
            <PerpsLineRow key={line.venue} line={line} {...lineStates(loading.perps)} />
          ))
        )}
        {Array.from({ length: rows - shown }, (_, i) => (
          <BlankLine key={i} />
        ))}
      </div>
    </div>
  );
}
