'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { StatTile } from '@/components/v2';
import { useMarketTx } from '@/hooks/pamm/use-market-tx';
import { useNearFunds } from '@/hooks/pamm/use-near-funds';
import { USDC_DECIMALS, USDC_SYMBOL } from '@/lib/near/config';
import { withdrawOnNear } from '@/lib/near/contract';
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

/** The wallet's tUSDC, the stake in positions, and what the contract holds for this account. */
export function PortfolioValue() {
  const { data: funds, isLoading } = useNearFunds();
  const inPositions = usePortfolioStore((s) => s.totalValue);
  const positionsLoading = usePortfolioStore((s) => s.summaryLoading);
  const withdraw = useMarketTx('', 'Withdrawal sent', (_: void) => withdrawOnNear());

  const human = (raw: bigint | undefined) => Number(raw ?? BigInt(0)) / 10 ** USDC_DECIMALS;
  const claimable = funds?.claimable ?? BigInt(0);
  const tile = (label: string, value: ReactNode, loading: boolean, sub?: ReactNode) => (
    <StatTile className={HEAD_TILE} label={label} loading={loading} value={value} sub={sub} />
  );

  return (
    <div
      data-testid="portfolio-value"
      className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-background/40 px-4 py-3 sm:grid-cols-3"
    >
      {tile(
        'Wallet',
        <Amount value={human(funds?.usdc)} />,
        isLoading,
        <Link href="/deposit" className={ACTION}>
          Deposit
        </Link>,
      )}
      {tile('In positions', <Amount value={inPositions} />, positionsLoading)}
      {tile(
        'Ready to withdraw',
        <Amount value={human(claimable)} />,
        isLoading,
        claimable > BigInt(0) ? (
          <button
            type="button"
            className={ACTION}
            disabled={withdraw.isPending}
            onClick={() => withdraw.mutate()}
            data-testid="portfolio-withdraw"
          >
            {withdraw.isPending ? 'Confirming…' : 'Withdraw'}
          </button>
        ) : (
          <span>Creator fees and failed payouts</span>
        ),
      )}
    </div>
  );
}
