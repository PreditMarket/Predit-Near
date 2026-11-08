'use client';

import { useEffect } from 'react';
import { notFound, useParams } from 'next/navigation';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { Skeleton } from '@/components/ui/skeleton';
import { PoolDetailLayout } from '@/components/pamm/pool-detail-layout';
import { usePoolState } from '@/hooks/pamm/use-pool-state';
import { useQuery } from '@tanstack/react-query';
import { pammMarketService } from '@/services/pamm-market.service';
import MarketDetails from '@/components/market/market-details';
import { usePammBetaIds } from '@/hooks/use-pamm-access';
import { useTrackedPammAccess } from '@/hooks/use-tracked-pamm-access';
import { useCollaterals, useCollateralMap } from '@/hooks/pamm/use-collaterals';
import { usePammFiatAccess } from '@/hooks/pamm/use-fiat-access';
import useAuthStore from '@/store/auth.store';
import { useHasSession } from '@/hooks/use-has-session';
import { trackMarketView } from '@/lib/analytics';
import { posthog, isPostHogReady } from '@/lib/posthog-init';
import { markMarketViewed } from '@/lib/last-market-view';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

function isValidPubkey(s: string): boolean {
  try { new PublicKey(s); return true; } catch { return false; }
}

function PammDetailContent({ poolAddress }: { poolAddress: string }) {
  const { data: market, isLoading: isMarketLoading, isError: isMarketError } = useQuery({
    queryKey: ['pamm', 'market', poolAddress],
    queryFn: () => pammMarketService.getMarketById(poolAddress),
    // While the AI resolve flow is mid-flight the row changes on the backend's
    // schedule (ensemble finishes, dispute window lapses, settle tx lands) with
    // no event to listen for. A dispute countdown reaching zero is NOT the
    // settlement — the cron still has to send the tx — so keep polling until
    // the status actually reaches resolved/cancelled.
    refetchInterval: (query) => {
      const m = query.state.data;
      if (!m) return false;
      // `tradingPausedAt` is checked separately: a paused market is still
      // `active`, and an admin can lift or close it at any moment.
      return m.status === 'pending_resolution' ||
        m.status === 'pending_resolve_review' ||
        !!m.tradingPausedAt
        ? 15_000
        : false;
    },
  });

  const { data: poolState, isLoading: isPoolLoading, isError: isPoolError } =
    usePoolState(poolAddress, market?.marketVersion ?? null);

  // Fiat (non-mintable collateral, e.g. USDC) markets are gated: the listing
  // hides them from non-whitelisted users, so a direct URL must be blocked too.
  const collateralMap = useCollateralMap();
  const { isLoading: isCollateralsLoading } = useCollaterals();
  const { data: fiatAccess, isLoading: isFiatAccessLoading } =
    usePammFiatAccess();

  const isLoggedIn = useHasSession();
  const { publicKey } = useWallet();

  // PostHog: tie every event in this session to this market via group
  // analytics. Lets dashboards pivot by market_id with one switch.
  useEffect(() => {
    if (!market || !isPostHogReady()) return;
    try {
      posthog.group('pamm_market', poolAddress, {
        market_name: market.question,
        creator_id: market.creatorId,
        collateral: market.collateralMint ?? undefined,
      });
    } catch { /* ignore */ }
  }, [poolAddress, market?.id]);

  // Fire market_view once per market id change. Re-firing on
  // auth/wallet flips would inflate view counts artificially.
  useEffect(() => {
    if (!market) return;
    trackMarketView({
      market_id: poolAddress,
      market_type: 'pamm',
      is_logged_in: isLoggedIn,
      has_wallet: !!publicKey,
    });
    markMarketViewed(poolAddress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolAddress, market?.id]);

  // Wait for the collateral catalog + fiat-access check too, so a gated fiat
  // market never briefly flashes its trading UI before the block resolves.
  if (
    isMarketLoading ||
    isPoolLoading ||
    isCollateralsLoading ||
    isFiatAccessLoading
  ) {
    return (
      <div className="space-y-3.5">
        <Skeleton className="h-[480px] w-full rounded-[10px]" />
        <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.15fr)_340px_320px]">
          <Skeleton className="h-56 w-full rounded-[10px]" />
          <Skeleton className="h-96 w-full rounded-[10px]" />
          <Skeleton className="h-96 w-full rounded-[10px]" />
        </div>
      </div>
    );
  }

  if (isMarketError || isPoolError || !poolState || !market) {
    return (
      <div className="rounded-[10px] border border-border bg-card p-16 text-center font-mono text-[13px] text-muted-foreground">
        Failed to load pool. It may not exist.
      </div>
    );
  }

  // A fiat market (non-mintable collateral) is off-limits to users outside the
  // fiat trade whitelist — mirror the list's exclusion on direct URL access.
  const isFiatMarket =
    collateralMap.get(market.collateralMint ?? '')?.mintable === false;
  if (isFiatMarket && fiatAccess && !fiatAccess.allowed) {
    return (
      <div className="rounded-[10px] border border-border bg-card p-16 text-center">
        <p className="text-[14px] font-semibold text-foreground">
          This market isn’t available for your account
        </p>
        <p className="mx-auto mt-2 max-w-md font-mono text-[12px] text-muted-foreground">
          USDC markets are limited to approved accounts. If you think this is a
          mistake, contact the team to request access.
        </p>
        <Link
          href="/markets"
          className="mt-6 inline-flex items-center gap-1.5 rounded-[6px] border border-border bg-card px-3 py-1.5 font-mono text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to markets
        </Link>
      </div>
    );
  }

  return <PoolDetailLayout poolState={poolState} poolAddress={poolAddress} market={market} />;
}

export function MarketDetailRouter() {
  const { id } = useParams<{ id: string }>();
  // Use the tracked variant on the route gate so every PAMM access
  // decision feeds the rollout-visibility funnel in PostHog.
  const pammAccess = useTrackedPammAccess({
    source: 'market-detail-router',
    marketId: isValidPubkey(id) ? id : undefined,
  });
  const { isLoading: pammLoading } = usePammBetaIds();
  const isAuthHydrated = useAuthStore((s) => s.isHydrated);

  if (isValidPubkey(id) && !pammLoading && isAuthHydrated && !pammAccess) notFound();

  if (isValidPubkey(id)) {
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

  return <MarketDetails />;
}
