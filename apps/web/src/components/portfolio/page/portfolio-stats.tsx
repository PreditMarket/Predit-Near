'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useShallow } from 'zustand/react/shallow';
import { Money, StatTile } from '@/components/v2';
import { cn } from '@/components/ui/utils';
import { formatPct } from '@/lib/format';
import { getCreatorFeeSummary } from '@/services/pamm/creator-kol.service';
import { useAuthStore } from '@/store/auth.store';
import { usePortfolioStore } from '@/store/portfolio.store';
import { canCloneMarket } from '@/utils/is-admin';

/** Win rate on settled prediction positions, and creator fees earned. */
export function PortfolioStats({ className }: { className?: string }) {
  const user = useAuthStore((s) => s.user);
  // Anyone signed in can clone a market, so anyone can have earned fees.
  const canEarnFees = canCloneMarket(user);
  const { winRate, wins, losses, summaryLoading } = usePortfolioStore(
    useShallow((s) => ({
      winRate: s.winRate,
      wins: s.wins,
      losses: s.losses,
      summaryLoading: s.summaryLoading,
    })),
  );

  const { data: fees, isLoading: feesLoading } = useQuery({
    queryKey: ['creatorFeeSummary', user?.id],
    queryFn: getCreatorFeeSummary,
    enabled: canEarnFees,
    staleTime: 30_000,
  });
  // USDC only: there is no USD rate for PXP, so adding it in would make a
  // number in no currency. The BE filters the same way for the profile.
  const feesUsd = useMemo(
    () =>
      Object.entries(fees?.totalsBySymbol ?? {})
        .filter(([symbol]) => symbol.trim().toUpperCase() === 'USDC')
        .reduce((sum, [, v]) => sum + v, 0),
    [fees],
  );

  const settled = wins + losses;
  return (
    <div className={cn('grid grid-cols-2 gap-3 lg:grid-cols-1', className)}>
      <StatTile
        data-testid="portfolio-win-rate"
        label="Win rate"
        loading={summaryLoading}
        value={
          <span
            className={
              settled === 0
                ? 'text-muted-foreground'
                : winRate >= 50
                  ? 'text-success'
                  : 'text-danger'
            }
          >
            {formatPct(winRate, { dp: 0 })}
          </span>
        }
        sub={<span>{wins}W · {losses}L settled</span>}
      />
      {/* Its own query's loading state, not the positions summary's: they
          land apart, and the wrong one flashed a confident $0.00. */}
      <StatTile
        data-testid="portfolio-fees"
        label="Fees earned"
        loading={feesLoading}
        value={<Money value={feesUsd} className="text-success" />}
        sub={<span>USDC, as a market creator</span>}
      />
    </div>
  );
}
