'use client';

import { useEffect } from 'react';
import { usePortfolioSummary } from '@/hooks/v2/use-portfolio-summary';
import { usePortfolioStore } from '@/store/portfolio.store';
import { PortfolioIdentity } from './portfolio-identity';
import { PortfolioStats } from './portfolio-stats';
import { PortfolioValue } from './portfolio-value';
import { PositionsSection } from './positions-section';

/**
 * `/portfolio`: the owner's profile header (as on `/u/@handle`), then the
 * account's money — value and PnL, positions and the account's other lists.
 */
export function PortfolioPage() {
  const fetchAll = usePortfolioStore((s) => s.fetchAll);
  // One read of the headline figures, for the value tile.
  const summary = usePortfolioSummary();

  // PAMM positions and their summary (win rate, trade count).
  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  return (
    <div className="mx-auto max-w-[1280px] w-full px-4 md:px-6 py-6">
      <PortfolioIdentity />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
        <PortfolioValue summary={summary} />
        <PortfolioStats />
      </div>

      <PositionsSection />
    </div>
  );
}
