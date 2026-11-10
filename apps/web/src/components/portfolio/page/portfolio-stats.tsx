'use client';

import { useShallow } from 'zustand/react/shallow';
import { StatTile } from '@/components/v2';
import { cn } from '@/components/ui/utils';
import { formatPct } from '@/lib/format';
import { usePortfolioStore } from '@/store/portfolio.store';

/** How often this account's settled predictions were right. */
export function PortfolioStats({ className }: { className?: string }) {
  const { winRate, wins, losses, summaryLoading } = usePortfolioStore(
    useShallow((s) => ({
      winRate: s.winRate,
      wins: s.wins,
      losses: s.losses,
      summaryLoading: s.summaryLoading,
    })),
  );

  const settled = wins + losses;
  return (
    <div className={cn('grid gap-3', className)}>
      <StatTile
        data-testid="portfolio-win-rate"
        label="Hit rate"
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
        sub={<span>{wins} right · {losses} wrong</span>}
      />
    </div>
  );
}
