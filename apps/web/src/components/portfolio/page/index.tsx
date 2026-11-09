'use client';

import { useEffect } from 'react';
import { usePortfolioStore } from '@/store/portfolio.store';
import { useNearWallet } from '@/store/near-wallet.store';
import { PortfolioIdentity } from './portfolio-identity';
import { PortfolioStats } from './portfolio-stats';
import { PortfolioValue } from './portfolio-value';
import { PositionsSection } from './positions-section';

/** `/portfolio`: the account, its money, and its positions and created markets. */
export function PortfolioPage() {
  const fetchAll = usePortfolioStore((s) => s.fetchAll);
  const accountId = useNearWallet((s) => s.accountId);

  // The wallet restores after the first paint, so read again once it is known.
  useEffect(() => {
    void fetchAll();
  }, [fetchAll, accountId]);

  return (
    <div className="mx-auto max-w-[1280px] w-full px-4 md:px-6 py-6">
      <PortfolioIdentity />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
        <PortfolioValue />
        <PortfolioStats />
      </div>

      <PositionsSection />
    </div>
  );
}
