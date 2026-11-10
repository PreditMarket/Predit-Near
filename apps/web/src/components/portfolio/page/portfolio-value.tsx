'use client';

import type { ReactNode } from 'react';
import { StatTile } from '@/components/v2';
import { useNearFunds } from '@/hooks/pamm/use-near-funds';
import { USDC_DECIMALS, USDC_SYMBOL } from '@/lib/near/config';
import { useFundsDialog } from '@/store/funds-dialog.store';
import { usePortfolioStore } from '@/store/portfolio.store';

const HEAD_TILE = 'px-3 py-2.5 bg-muted/20';

function Amount({ value }: { value: number }) {
  return (
    <span className="tabular-nums">
      {value.toLocaleString('en-US', { maximumFractionDigits: 2 })} {USDC_SYMBOL}
    </span>
  );
}

const ACTION =
  'font-mono text-[11px] font-bold uppercase tracking-wider text-primary hover:underline disabled:opacity-50';

/** The wallet's tUSDC and the stake in positions. Creator fees to collect live in the Withdraw dialog. */
export function PortfolioValue() {
  const { data: funds, isLoading } = useNearFunds();
  const inPositions = usePortfolioStore((s) => s.totalValue);
  const positionsLoading = usePortfolioStore((s) => s.summaryLoading);
  const openFunds = useFundsDialog((s) => s.open);

  const human = (raw: bigint | undefined) => Number(raw ?? BigInt(0)) / 10 ** USDC_DECIMALS;
  const tile = (label: string, value: ReactNode, loading: boolean, sub?: ReactNode) => (
    <StatTile className={HEAD_TILE} label={label} loading={loading} value={value} sub={sub} />
  );

  return (
    <div
      data-testid="portfolio-value"
      className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-background/40 px-4 py-3 sm:grid-cols-2"
    >
      {tile(
        'Wallet',
        <Amount value={human(funds?.usdc)} />,
        isLoading,
        <span className="flex gap-3">
          <button type="button" data-testid="portfolio-deposit" className={ACTION} onClick={() => openFunds('deposit')}>
            Deposit
          </button>
          <button type="button" data-testid="portfolio-send" className={ACTION} onClick={() => openFunds('withdraw')}>
            Withdraw
          </button>
        </span>,
      )}
      {tile('In positions', <Amount value={inPositions} />, positionsLoading)}
    </div>
  );
}
