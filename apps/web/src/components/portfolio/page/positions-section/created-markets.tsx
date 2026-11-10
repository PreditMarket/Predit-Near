'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { getAllNearMarkets } from '@/lib/near/contract';
import { bondStateOf, phaseOf, phaseLabel, type NearBondState } from '@/lib/near/map';
import { USDC_DECIMALS, USDC_SYMBOL } from '@/lib/near/config';
import type { NearMarket } from '@/lib/near/types';
import { useNearWallet } from '@/store/near-wallet.store';
import type { CreatedMarketsFilter } from './use-positions-url';

const BOND_LABEL: Record<NearBondState, string> = {
  locked: 'Locked',
  returned: 'Returned',
  forfeited: 'Forfeited',
};
const BOND_TONE: Record<NearBondState, string> = {
  locked: 'text-warning',
  returned: 'text-success',
  forfeited: 'text-danger',
};

const near = (yocto: string) => Number(yocto) / 1e24;
const usdc = (raw: string) => Number(raw) / 10 ** USDC_DECIMALS;

function CreatedMarketRow({ market }: { market: NearMarket }) {
  const bond = bondStateOf(market);
  return (
    <Link
      href={`/market/${market.id}`}
      data-testid="created-market"
      className="flex flex-col gap-2 rounded-lg border border-border bg-card px-4 py-3 hover:bg-muted/40"
    >
      <span className="text-[13.5px] font-semibold text-foreground">{market.rules.question}</span>
      <span className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground">
        <span className="font-bold text-foreground">{phaseLabel(market)}</span>
        <span data-testid="created-market-bond">
          {BigInt(market.creation_bond) > BigInt(0) ? (
            <>
              Bond {near(market.creation_bond)} NEAR · <span className={BOND_TONE[bond]}>{BOND_LABEL[bond]}</span>
            </>
          ) : (
            'No bond'
          )}
        </span>
        <span>
          Volume {usdc(market.volume).toLocaleString('en-US', { maximumFractionDigits: 2 })} {USDC_SYMBOL}
        </span>
        <span>{market.trades} trades</span>
      </span>
    </Link>
  );
}

/** The markets this account created, with where each one is and its bond. */
export function CreatedMarkets({ search, status }: { search: string; status: CreatedMarketsFilter }) {
  const accountId = useNearWallet((s) => s.accountId);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['near', 'created-markets', accountId],
    queryFn: async () =>
      (await getAllNearMarkets()).filter((m) => m.creator === accountId).reverse(),
    enabled: !!accountId,
    refetchInterval: 15_000,
  });

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data ?? []).filter(
      (m) =>
        (status === 'all' || phaseOf(m) === status) &&
        (!term || m.rules.question.toLowerCase().includes(term)),
    );
  }, [data, search, status]);

  if (isLoading) return <div className="h-20 animate-pulse rounded-lg bg-muted/40" aria-hidden />;
  if (isError) return <p className="py-8 text-[13px] text-muted-foreground">Could not read your markets.</p>;
  if (!shown.length) return <p className="py-8 text-[13px] text-muted-foreground">No markets here yet.</p>;
  return (
    <div className="flex flex-col gap-2">
      {shown.map((market) => (
        <CreatedMarketRow key={market.id} market={market} />
      ))}
    </div>
  );
}
