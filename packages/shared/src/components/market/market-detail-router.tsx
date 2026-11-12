'use client';

import { notFound, useParams } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { PoolDetailLayout } from '@/components/pamm/pool-detail-layout';
import { usePoolState } from '@/hooks/pamm/use-pool-state';
import { useQuery } from '@tanstack/react-query';
import { getPammMarketById } from '@/services/pamm-market.service';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

/** Market ids are the contract's sequence numbers. */
const isMarketId = (id: string) => /^\d+$/.test(id);

function PammDetailContent({ poolAddress }: { poolAddress: string }) {
  const { data: market, isLoading: isMarketLoading, isError: isMarketError } = useQuery({
    queryKey: ['pamm', 'market', poolAddress],
    queryFn: () => getPammMarketById(poolAddress),
    // Waiting for a result, the market changes when a receipt is posted,
    // challenged or finalized, with no event to listen for.
    refetchInterval: (query) => {
      const m = query.state.data;
      return m?.status === 'pending_resolution' || m?.status === 'pending_resolve_review'
        ? 15_000
        : false;
    },
  });

  const { data: poolState, isLoading: isPoolLoading, isError: isPoolError } =
    usePoolState(poolAddress);

  if (isMarketLoading || isPoolLoading) {
    return (
      <div className="space-y-3.5">
        <Skeleton className="h-[480px] w-full rounded-[10px]" />
        <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.15fr)_340px]">
          <Skeleton className="h-56 w-full rounded-[10px]" />
          <Skeleton className="h-96 w-full rounded-[10px]" />
        </div>
      </div>
    );
  }

  if (isMarketError || isPoolError || !poolState || !market) {
    return (
      <div className="rounded-[10px] border border-border bg-card p-16 text-center font-mono text-[13px] text-muted-foreground">
        Could not load this market. It may not exist.
      </div>
    );
  }

  return <PoolDetailLayout poolState={poolState} poolAddress={poolAddress} market={market} />;
}

export function MarketDetailRouter() {
  const { id } = useParams<{ id: string }>();

  if (!isMarketId(id)) notFound();

    return (
      <div className="mx-auto max-w-[1440px] px-3 sm:px-6 pb-16 pt-5">
        <div className="mb-5">
          <Link
            href="/markets"
            className="inline-flex items-center gap-1.5 rounded-[6px] border border-border bg-card px-3 py-1.5 font-mono text-[11.5px] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All markets
          </Link>
        </div>
        <PammDetailContent poolAddress={id} />
      </div>
    );
}
