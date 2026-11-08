'use client';

import { ImageWithFallback } from '@/components/figma/image-with-fallback';
import { MarketDescriptionContent } from '@/components/market/market-description-content';
import { fmtPct, fmtVol } from '@/components/shared/market-card';
import { EnsembleResultCard } from '@/components/market/ensemble-result-card';
import type { PoolStateResult } from '@/hooks/pamm/use-pool-state';
import { useConfig } from '@/hooks/pamm/use-config';
import { useTradingBan } from '@/hooks/pamm/use-trading-ban';
import { formatDate } from '@/lib/date';
import type { MarketRules } from '@/services/market.service';
import BN from 'bn.js';
import {
  ChevronDown,
  Clock,
  ExternalLink,
  Gavel,
  Info,
  Loader2,
  TimerReset,
  TrendingUp,
} from 'lucide-react';
import { useState } from 'react';
import { EarlyResolveRequest } from './resolve/early-resolve-request';
import { ResolveStatusBanner } from './resolve/resolve-status-banner';
import { RedeemPanel } from './redeem-panel';
import { SwapPanel } from './swap-panel';

// ─── Rules & Resolution ──────────────────────────────────────────────────────

function RulesResolutionCard({
  rules,
  outcome,
  oracleName,
  yesLabel = 'Yes',
  noLabel = 'No',
}: {
  rules: MarketRules;
  outcome?: string | null;
  oracleName?: string;
  yesLabel?: string;
  noLabel?: string;
}) {
  const yesRule = rules.outcomeRules?.find((r) => r.outcomeIndex === 0);
  const noRule = rules.outcomeRules?.find((r) => r.outcomeIndex === 1);
  // `outcome` is a raw resolution-code string ('YES'/'NO') from the AI
  // suggestion, not a display label — map it through the market's own
  // custom labels for what's actually shown.
  const outcomeDisplay =
    outcome === 'YES' ? yesLabel : outcome === 'NO' ? noLabel : outcome;

  return (
    <div className="px-[18px] py-4 border-b border-border last:border-0">
      <div className="mb-3 flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        <Gavel className="w-3 h-3" /> Rules &amp; Resolution
      </div>

      <div className="space-y-4">
        {outcome && (
          <div className="flex items-center gap-2 text-[12px]">
            <span className="text-muted-foreground">Resolves to</span>
            <span
              className={`font-bold ${outcome === 'YES' ? 'text-success' : 'text-danger'}`}
            >
              {outcomeDisplay}
            </span>
          </div>
        )}

        {rules.description && (
          <div>
            <MarketDescriptionContent
              value={rules.description}
              className="text-[13px] text-muted-foreground"
            />
          </div>
        )}

        {(yesRule || noRule) && (
          <div className="space-y-3">
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Market resolves
            </p>

            {yesRule && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <div className="rounded-md px-2 py-0.5 text-[11px] font-bold border border-success/60 bg-success/10 text-success">
                    {(yesRule.label || yesLabel).toUpperCase()}
                  </div>
                </div>
                <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
                  <MarketDescriptionContent
                    value={yesRule.rule}
                    className="text-[13px] text-foreground"
                  />
                </div>
              </div>
            )}

            {noRule && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <div className="rounded-md px-2 py-0.5 text-[11px] font-bold border border-danger/60 bg-danger/10 text-danger">
                    {(noRule.label || noLabel).toUpperCase()}
                  </div>
                </div>
                <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
                  <MarketDescriptionContent
                    value={noRule.rule}
                    className="text-[13px] text-foreground"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {oracleName && (
          <div className="space-y-1 pt-2 border-t border-border/40">
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Resolver
            </p>
            <p className="text-[13px]">{oracleName}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────

// YES/NO as 2-decimal percents; NO is snapped to `100 - YES` on the rounded
// value so the pair always sums to 100.00%.
function pctPair(priceYes: number) {
  const yes = Math.round(priceYes * 10_000) / 100;
  return { yes: fmtPct(yes), no: fmtPct(100 - yes) };
}

function formatCompact(value: number) {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

function formatTokenAmount(raw: bigint, decimals = 6, digits = 2) {
  return (Number(raw) / 10 ** decimals).toLocaleString('en-US', {
    maximumFractionDigits: digits,
  });
}

function shortAddr(v: string, s = 6, e = 4) {
  return `${v.slice(0, s)}…${v.slice(-e)}`;
}

function formatCountdown(expiryTs: number, now: number) {
  const diff = expiryTs - now;
  if (diff <= 0) return 'Expired';
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = Math.floor(diff % 60);
  if (d > 0) return `${d}d ${h}h ${m}m ${s}s`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function getStatus(
  resolutionCode: number,
  expiryTs: number,
  yesLabel = 'Yes',
  noLabel = 'No',
) {
  if (resolutionCode === 1)
    return {
      label: `Resolved ${yesLabel.toUpperCase()}`,
      cls: 'bg-success/10 text-success border-success/20',
    };
  if (resolutionCode === 2)
    return {
      label: `Resolved ${noLabel.toUpperCase()}`,
      cls: 'bg-danger/10 text-danger border-danger/20',
    };
  if (Date.now() / 1000 >= expiryTs)
    return {
      label: 'Expired',
      cls: 'bg-warning/10 text-warning border-warning/20',
    };
  return {
    label: 'Live',
    cls: 'bg-success/10 text-success border-success/20',
  };
}

function formatTimeAgo(ts: number, now: number) {
  const diff = Math.floor(now - ts / 1000);
  if (diff < 60) return `${Math.max(1, diff)}s`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

// ─── dual-line chart ─────────────────────────────────────────────────────────

function buildRealChart(
  trades: any[],
  currentPriceYes: number,
  createdTs: number,
  now: number,
) {
  type Pt = [number, number];
  const duration = Math.max(1, now - createdTs);

  const yesPts: Pt[] = [];
  const noPts: Pt[] = [];
  const meta: { x: number; priceYes: number; ts: number }[] = [];

  // Start point at 50%
  const startY = Math.round((1 - 0.5) * 224 + 8);
  yesPts.push([40, startY]);
  noPts.push([40, Math.round(0.5 * 224 + 8)]);
  meta.push({ x: 40, priceYes: 0.5, ts: createdTs });

  // Trades
  const sortedTrades = [...(trades || [])].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  sortedTrades.forEach((t) => {
    const tradeTs = new Date(t.createdAt).getTime() / 1000;
    const pct = Math.max(0, Math.min(1, (tradeTs - createdTs) / duration));
    const x = 40 + pct * 640;
    const priceYes = Math.max(0.04, Math.min(0.96, t.priceYes));

    const yesY = Math.round((1 - priceYes) * 224 + 8);
    const noY = Math.round(priceYes * 224 + 8);

    yesPts.push([Math.round(x), yesY]);
    noPts.push([Math.round(x), noY]);
    meta.push({ x: Math.round(x), priceYes, ts: tradeTs });
  });

  // End point (current price)
  const finalPriceYes = Math.max(0.04, Math.min(0.96, currentPriceYes));
  const finalYesY = Math.round((1 - finalPriceYes) * 224 + 8);
  const finalNoY = Math.round(finalPriceYes * 224 + 8);
  yesPts.push([680, finalYesY]);
  noPts.push([680, finalNoY]);
  meta.push({ x: 680, priceYes: finalPriceYes, ts: now });

  const toLine = (pts: Pt[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ');
  const toFill = (pts: Pt[]) => {
    const last = pts[pts.length - 1];
    return `${toLine(pts)} L${last[0]},240 L40,240 Z`;
  };

  const flat = meta.every((p) => p.priceYes === 0.5);

  return {
    yesLine: toLine(yesPts),
    yesFill: toFill(yesPts),
    noLine: toLine(noPts),
    noFill: toFill(noPts),
    lastYes: yesPts[yesPts.length - 1],
    lastNo: noPts[noPts.length - 1],
    points: meta,
    flat,
  };
}

// ─── Bonus XP Awards (admin-only) ────────────────────────────────────────────

function BonusXpAwardsTable({
  marketId,
  isResolved,
  className,
}: {
  marketId: string;
  isResolved: boolean;
  className?: string;
}) {
  const [awards, setAwards] = useState<PammMarketBonusXpAward[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isResolved) return;
    setLoading(true);
    pammMarketAdminService
      .getBonusXpAwards(marketId)
      .then(setAwards)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [marketId, isResolved]);

  return (
    <div
      className={`max-lg:order-6 rounded-[10px] border border-border bg-card overflow-hidden${className ? ` ${className}` : ''}`}
    >
      <div className="flex items-center gap-2 px-4.5 py-3 border-b border-border">
        <span className="text-[12.5px] font-semibold">Bonus XP Awards</span>
        <span className="rounded-[3px] border border-warning/40 bg-warning/10 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-widest text-warning">
          Admin
        </span>
      </div>
      {!isResolved ? (
        <div className="py-8 text-center font-mono text-[11px] text-muted-foreground">
          Awards are distributed after the market resolves.
        </div>
      ) : loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : awards.length === 0 ? (
        <div className="py-8 text-center font-mono text-[11px] text-muted-foreground">
          No awards recorded yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[420px]">
            <div
              className="grid gap-x-2 px-4.5 py-2 bg-background border-b border-border font-mono text-[8.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground"
              style={{ gridTemplateColumns: '1fr 100px 80px 80px' }}
            >
              <span>User ID</span>
              <span className="text-right">Bonus XP</span>
              <span className="text-right">Volume</span>
              <span className="text-right">% of Total</span>
            </div>
            {awards.map((a) => {
              const pct =
                a.totalWinVolume > 0
                  ? ((a.userVolume / a.totalWinVolume) * 100).toFixed(1)
                  : '—';
              return (
                <div
                  key={a.id}
                  className="grid items-center gap-x-2 px-4.5 py-2 border-b border-border last:border-0 font-mono text-[11px]"
                  style={{ gridTemplateColumns: '1fr 100px 80px 80px' }}
                >
                  <span
                    className="truncate text-muted-foreground"
                    title={a.userId}
                  >
                    {a.userId.slice(0, 8)}…{a.userId.slice(-4)}
                  </span>
                  <span className="text-right font-semibold text-warning">
                    {a.bonusXp.toLocaleString()} XP
                  </span>
                  <span className="text-right text-foreground">
                    {a.userVolume.toFixed(2)}
                  </span>
                  <span className="text-right text-muted-foreground">{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── component ───────────────────────────────────────────────────────────────

import { useCollateralMap } from '@/hooks/pamm/use-collaterals';
import { solscanAddressUrl, solscanTxUrl } from '@/lib/pamm/solscan';
import { PammMarket, pammMarketService } from '@/services/pamm-market.service';
import {
  pammMarketAdminService,
  type PammMarketBonusXpAward,
} from '@/services/pamm-market-admin.service';
import useAuthStore from '@/store/auth.store';
import { LiveKitRoom } from '@livekit/components-react';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { MarketStreamCard } from './market-stream-card';
import { useHasSession } from '@/hooks/use-has-session';
import { RoastFeed } from './roast-feed';
import { PammShareButton } from './share-button';
import { EarlyResolutionButton } from './report/early-resolution-button';
import { RequestTrendingButton } from './trending/request-trending-button';
import { canRequestTrending } from '@/utils/is-admin';
import { showErrorToast } from '@/components/error/toast-error';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from '@/components/ui/drawer';

interface PoolDetailLayoutProps {
  poolState: PoolStateResult;
  poolAddress: string;
  market: PammMarket;
}

export function PoolDetailLayout({
  poolState,
  poolAddress,
  market,
}: PoolDetailLayoutProps) {
  const { pool } = poolState;
  const { data: pammConfig } = useConfig();
  const bannedFromTrading = useTradingBan(poolAddress);
  const [sessionKey, setSessionKey] = useState(0);
  const [howOpen, setHowOpen] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const [mobileTab, setMobileTab] = useState<'chart' | 'stream'>('chart');
  const [tradeOpen, setTradeOpen] = useState(false);
  // `?side=yes|no` from a Predit AI "Trade on Predit" link (plan 05 F3):
  // the side the trade form opens on. Read after mount, so the cached page
  // stays the same for every visitor.
  const [linkSide, setLinkSide] = useState<'yes' | 'no' | undefined>();
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get('side');
    if (s === 'yes' || s === 'no') setLinkSide(s);
  }, []);
  const [hoverData, setHoverData] = useState<{
    x: number;
    priceYes: number;
    ts: number;
  } | null>(null);
  const isMethodologyEnabled =
    process.env.NEXT_PUBLIC_METHODOLOGY_ENABLE === 'true';

  useEffect(() => {
    setNow(Date.now() / 1000);
    const t = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(t);
  }, []);

  const { data: realtime } = useQuery({
    queryKey: ['pamm', 'market', poolAddress, 'realtime'],
    queryFn: () => pammMarketService.getRealtime(poolAddress),
    refetchInterval: 5000,
  });

  // Paginated trade history (separate from the realtime feed that drives the
  // chart). keepPreviousData avoids a flash of "no trades" while paging.
  const TRADES_PER_PAGE = 10;
  const [tradePage, setTradePage] = useState(1);
  const { data: tradesPage } = useQuery({
    queryKey: ['pamm', 'market', poolAddress, 'trades', tradePage],
    queryFn: () =>
      pammMarketService.getTrades(poolAddress, {
        page: tradePage,
        limit: TRADES_PER_PAGE,
      }),
    placeholderData: keepPreviousData,
    refetchInterval: 5000,
  });

  const user = useAuthStore((s) => s.user);

  const { data: streamInfo } = useQuery({
    queryKey: ['pamm', 'market', poolAddress, 'stream'],
    queryFn: () => pammMarketService.getStream(poolAddress),
  });

  const isCreator = useMemo(() => {
    if (!user || !market) return false;
    return market.creatorId === user.id;
  }, [user, market]);

  const isAdminOnly = useMemo(() => {
    if (!user || !market) return false;
    return !!user.isAdmin && market.creatorId !== user.id;
  }, [user, market]);

  const canRequestTrendingForMarket =
    isCreator &&
    canRequestTrending(user) &&
    !market.isTrending &&
    market.status === 'active';

  const qcAdmin = useQueryClient();
  const disputeAutoResolveMutation = useMutation({
    mutationFn: () => pammMarketAdminService.disputeAutoResolve(market.id),
    onSuccess: () => {
      toast.success('Marked as disputed.');
      qcAdmin.invalidateQueries({ queryKey: ['pamm', 'market', poolAddress] });
    },
    onError: (err) => showErrorToast(err),
  });
  // Only shown to admins on a market this backend auto-resolved from its
  // source (e.g. Polymarket) — the button just flags `autoResolveDisputed`,
  // it does NOT reverse the on-chain outcome (manual dev/ops follow-up
  // needed after this, per market-clone.md §4).
  const canDisputeAutoResolve =
    isAdminOnly &&
    !!market.autoResolvedAt &&
    !market.autoResolveDisputed &&
    (!market.autoResolveDisputeUntil ||
      new Date(market.autoResolveDisputeUntil).getTime() > Date.now());

  // Signing in swaps a guest's watch-only token for one that can chat.
  const hasSession = useHasSession();
  const { data: streamTokenData } = useQuery({
    queryKey: ['pamm', 'market', poolAddress, 'token', isCreator, hasSession],
    queryFn: () =>
      isCreator
        ? pammMarketService.getPublisherToken(poolAddress)
        : pammMarketService.getViewerToken(poolAddress),
    enabled: !!streamInfo,
  });

  const livekitUrl =
    process.env.NEXT_PUBLIC_LIVEKIT_URL ||
    'wss://predit-rqo2i5rj.livekit.cloud';

  const collateralMap = useCollateralMap();
  const collateralToken = collateralMap.get(pool.collateralMint.toBase58());
  const collateralSymbol =
    collateralToken?.symbol ?? pool.collateralMint.toBase58().slice(0, 6);

  // "Widget" mode's floating anchor — mainnet + real-USDC-collateral only,
  // and only while the user's preference is 'widget' (the alternative,
  // 'inline', has no floating anchor at all — its trigger lives inside
  // SwapPanel's own insufficient-balance banner instead).

  // Prefer the on-chain resolutionCode (source of truth), but fall back to
  // the DB resolution so the result shows immediately after an admin resolve
  // even while the on-chain account read is still catching up (RPC lag) or
  // when the market was resolved off-chain.
  const dbResolutionCode =
    market.resolution === 'yes' ? 1 : market.resolution === 'no' ? 2 : 0;
  const effectiveResolutionCode =
    pool.resolutionCode !== 0 ? pool.resolutionCode : dbResolutionCode;
  const isResolved = effectiveResolutionCode !== 0;
  // Cancelled = resolver flagged the market undeterminable. Trading stays open
  // (sell-only) so holders can reclaim collateral. On-chain flag is source of
  // truth; fall back to the DB status while the account read catches up.
  const isCancelled =
    !isResolved && (pool.cancelled || market.status === 'cancelled');
  // V3's only cancelled-market reclaim path is refund_v3 (RedeemPanel) — sell
  // always reverts once cancelled (on-chain AlreadyCancelled). V1/V2
  // cancelled pools legitimately still take sells as the reclaim mechanism
  // (LP-based), so only redirect V3 to RedeemPanel here.
  // The AI-resolve window. Both statuses mean the backend has stopped
  // recording trades, and `pending_resolve_review` in particular is NOT a
  // settled market: no outcome is on-chain, so redeem/refund would revert.
  const isResolving =
    market.status === 'pending_resolution' ||
    market.status === 'pending_resolve_review';
  // Reversible halt from the trader petition — the market is still `active`,
  // so nothing in `status` reflects it.
  const isTradingPaused = !!market.tradingPausedAt && !isResolving;
  const showRedeemPanel =
    isResolved || (isCancelled && poolState.marketVersion === 'v3_shares');
  const expiryTs = (pool.expiryTs as unknown as BN).toNumber();
  const isExpiredUnresolved =
    !isResolved && !isCancelled && now !== null && now >= expiryTs;
  const createdTs = (pool.createdTs as unknown as BN).toNumber();
  const seeded = pool.seeded;

  const yesPercent = poolState.priceYes * 100;
  const yesLabel = market.yesLabel?.trim() || 'Yes';
  const noLabel = market.noLabel?.trim() || 'No';
  const status = isCancelled
    ? {
        label: 'Cancelled',
        cls: 'bg-danger/10 text-danger border-danger/20',
      }
    : getStatus(effectiveResolutionCode, expiryTs, yesLabel, noLabel);
  const countdown = now !== null ? formatCountdown(expiryTs, now) : '--m --s';
  // Stable time for chart to prevent constant drifting
  const chartNow = useMemo(() => {
    return Date.now() / 1000;
  }, [realtime?.latestTrades]);

  const chart = buildRealChart(
    realtime?.latestTrades || [],
    poolState.priceYes,
    createdTs,
    chartNow,
  );

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = 740 / rect.width;
    const svgX = (e.clientX - rect.left) * scaleX;

    let closest = chart.points[0];
    let minDiff = Math.abs(svgX - closest.x);
    for (const pt of chart.points) {
      const diff = Math.abs(svgX - pt.x);
      if (diff < minDiff) {
        closest = pt;
        minDiff = diff;
      }
    }
    setHoverData(closest);
  };

  const handleMouseLeave = () => {
    setHoverData(null);
  };

  const explorerUrl = solscanAddressUrl(poolAddress);

  const collateralDecimals = poolState.pool.collateralDecimals;
  const collateralScale = 10 ** collateralDecimals;
  const collateralUSD =
    Number(poolState.collateralVaultBalance) / collateralScale;

  const trades =
    tradesPage?.data
      ?.filter((t) => t.side !== 'seed')
      .map((t) => {
        const isBuy = t.side.startsWith('buy_');
        const isYes = t.side.includes('yes');
        return {
          time:
            now !== null
              ? formatTimeAgo(new Date(t.createdAt).getTime(), now)
              : '',
          handle: shortAddr(t.traderAddress, 4, 4),
          tier: '—',
          tCls: 'bg-muted text-muted-foreground',
          action: isBuy ? 'BUY' : 'SELL',
          outcome: (isYes ? yesLabel : noLabel).toUpperCase(),
          isBuy,
          isYes,
          shares: (Number(t.amountOut) / collateralScale).toLocaleString(
            undefined,
            {
              maximumFractionDigits: 0,
            },
          ),
          price: isYes ? pctPair(t.priceYes).yes : pctPair(t.priceYes).no,
          txSig: t.txSig,
          txShort: shortAddr(t.txSig, 4, 4),
          solscanUrl: solscanTxUrl(t.txSig),
        };
      }) || [];
  const tradesHasNext = tradesPage?.hasNextPage ?? false;

  // resolver is now global (on Config), not per-pool.
  const resolverShort = pammConfig?.resolver
    ? shortAddr(pammConfig.resolver.toBase58(), 4, 4)
    : 'Global resolver';

  const showOnMobile = (...tabs: Array<'chart' | 'stream'>) =>
    tabs.includes(mobileTab) ? '' : 'max-lg:hidden';

  const mobileTabs = [
    // Trades sit under the chart on Market rather than behind their own
    // tab, so price and the flow behind it read as one screen.
    { id: 'chart' as const, label: 'Market' },
    { id: 'stream' as const, label: 'Stream' },
  ];

  return (
    <>
      {/* ── Mobile tab bar ── */}
      <div className="lg:hidden mb-3 bg-background rounded-xl p-1 flex gap-0.5">
        {mobileTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setMobileTab(tab.id)}
            className={`flex-1 min-h-11 py-2 rounded-[10px] font-mono text-[12px] font-bold uppercase tracking-widest transition-all duration-150 ${
              mobileTab === tab.id
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground/60'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="grid gap-3.5 lg:grid-cols-[1fr_340px] xl:grid-cols-[1fr_340px_360px] items-start pb-28 lg:pb-0">
        {/* ── Col 1: chart + trades ── */}
        <div className="max-lg:contents lg:flex lg:flex-col lg:gap-3.5">
          {/* Chart card */}
          <div
            className={`${showOnMobile('chart')} max-lg:order-1 rounded-[10px] border border-border bg-card overflow-hidden`}
          >
            {/* Eyebrow */}
            <div className="flex flex-wrap items-center gap-2 px-[18px] py-[13px] border-b border-border">
              <span
                className={`rounded-[3px] border px-[7px] py-0.5 font-mono text-[8.5px] font-bold uppercase tracking-[0.1em] flex items-center gap-1 ${
                  seeded
                    ? 'bg-success/10 text-success border-success/20'
                    : 'bg-warning/10 text-warning border-warning/20'
                }`}
              >
                {seeded ? (
                  <>
                    <span className="text-[7px]">●</span> Live
                  </>
                ) : (
                  'Pending seed'
                )}
              </span>
              {!(seeded && status.label === 'Live') && (
                <span
                  className={`rounded-[3px] border px-[7px] py-0.5 font-mono text-[8.5px] font-bold uppercase tracking-[0.1em] flex items-center gap-1 ${status.cls}`}
                >
                  <span className="text-[7px]">★</span> {status.label}
                </span>
              )}
              {market.isBonusXp && (
                <span className="rounded-[3px] border border-warning/40 bg-warning/10 px-1.75 py-0.5 font-mono text-[8.5px] font-bold uppercase tracking-widest text-warning">
                  Bonus XP
                </span>
              )}
              {market.isTrending && (
                <span className="flex items-center gap-1 rounded-[3px] border border-success/40 bg-success/10 px-1.75 py-0.5 font-mono text-[8.5px] font-bold uppercase tracking-widest text-success">
                  <TrendingUp className="h-2.5 w-2.5" />
                  Trending
                </span>
              )}
              {market.sourceProvider && (
                <a
                  href={market.sourceUrl || undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="touch-hit rounded-[3px] border border-primary/40 bg-primary/10 px-1.75 py-0.5 font-mono text-[8.5px] font-bold uppercase tracking-widest text-primary hover:brightness-110"
                >
                  {market.sourceProvider === 'kalshi' ? 'Kalshi' : 'Polymarket'}
                </a>
              )}
              <span className="flex-1" />
              {canRequestTrendingForMarket && (
                <>
                  <RequestTrendingButton marketId={market.id} />
                  <span className="h-3.5 w-px bg-border" />
                </>
              )}
              <EarlyResolutionButton
                marketId={market.id}
                marketQuestion={market.question}
                variant="toolbar"
              />
              <span className="h-3.5 w-px bg-border" />
              <span className="flex items-center gap-1.5 font-bold text-warning">
                <TimerReset className="h-3.5 w-3.5" />
                <span className="font-mono text-[8.5px] font-semibold text-warning/70 uppercase tracking-[0.08em]">
                  Ends in
                </span>
                <span className="font-mono text-[11.5px]">{countdown}</span>
              </span>
            </div>

            {/* Settlement-in-progress notice */}
            {isExpiredUnresolved && (
              <div className="flex items-start gap-2 border-b border-warning/20 bg-warning/10 px-[18px] py-2.5 text-[11.5px] text-warning">
                <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <span className="font-semibold">Settlement in progress.</span>{' '}
                  Settlement by AI agent may take up to 24 hours.
                </span>
              </div>
            )}

            {/* Question */}
            <div className="px-[18px] py-3.5 border-b border-border">
              <div className="flex items-start gap-3">
                {market.thumbnail?.path && (
                  <div className="shrink-0 w-12 h-12 rounded-[8px] overflow-hidden bg-muted">
                    <ImageWithFallback
                      src={market.thumbnail.path}
                      alt={market.question}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h1 className="text-[18px] font-bold leading-[1.35] tracking-[-0.02em]">
                    {market.question}
                  </h1>
                  <div className="mt-2 flex items-center gap-2.5 text-[11px] text-muted-foreground">
                    <a
                      href={market.tweetUrl || explorerUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 font-mono transition-colors hover:text-primary"
                    >
                      View source
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <span className="h-3 w-px bg-border" />
                    <PammShareButton
                      url={`/market/${poolAddress}`}
                      question={market.question}
                      size="sm"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* AI-resolve status — provisional result + dispute window */}
            <ResolveStatusBanner
              market={market}
              poolAddress={poolAddress}
              yesLabel={yesLabel}
              noLabel={noLabel}
              isCreator={isCreator}
            />

            {/* Stats strip */}
            <div className="flex border-b border-border overflow-x-auto">
              {[
                {
                  label: `${yesLabel} price`,
                  value: pctPair(poolState.priceYes).yes,
                  cls: 'text-success',
                },
                {
                  label: `${noLabel} price`,
                  value: pctPair(poolState.priceYes).no,
                  cls: 'text-danger',
                },
                {
                  label: `${collateralSymbol} ${poolState.marketVersion === 'v2_position' ? 'reserve' : 'vault'}`,
                  value: formatCompact(collateralUSD),
                  cls: '',
                },
                {
                  label: 'Total volume',
                  value:
                    fmtVol(String(market.totalVolumeUsdc ?? 0), collateralSymbol) ??
                    (collateralSymbol === 'PXP' ? '0 XP' : '$0'),
                  cls: '',
                },
                {
                  label: 'Created',
                  value: formatDate(market.createdAt),
                  cls: '',
                },
              ].map((s, i, arr) => (
                <div
                  key={s.label}
                  className={`flex flex-col gap-0.5 px-4 py-2.5 shrink-0 ${i < arr.length - 1 ? 'border-r border-border' : ''}`}
                >
                  <span className="font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    {s.label}
                  </span>
                  <span
                    className={`font-mono text-[12px] font-semibold ${s.cls || 'text-foreground'}`}
                  >
                    {s.value}
                  </span>
                </div>
              ))}
            </div>

            {/* Outcome badge (resolved) */}
            {isResolved && (
              <div className="px-[18px] pb-4 border-t border-border pt-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                    Outcome
                  </span>
                  <span
                    className={`rounded-[5px] px-2.5 py-1 font-mono text-[12px] font-bold ${
                      effectiveResolutionCode === 1
                        ? 'bg-[var(--brand-success-soft)] text-[color:var(--brand-green)]'
                        : 'bg-[var(--brand-danger-soft)] text-[color:var(--brand-red)]'
                    }`}
                  >
                    {(effectiveResolutionCode === 1
                      ? yesLabel
                      : noLabel
                    ).toUpperCase()}
                  </span>
                  {market.resolvedBy?.startsWith('system:') ? (
                    <span className="rounded-[3px] border border-primary/40 bg-primary/10 px-1.75 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-primary">
                      Auto-resolved
                    </span>
                  ) : (
                    market.resolvedBy && (
                      <span className="font-mono text-[10px] text-muted-foreground">
                        by {market.resolvedBy}
                      </span>
                    )
                  )}
                  {market.autoResolveDisputed && (
                    <span className="rounded-[3px] border border-danger/40 bg-danger/10 px-1.75 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-danger">
                      Disputed
                    </span>
                  )}
                  {canDisputeAutoResolve && (
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          window.confirm(
                            'Flag this auto-resolve as disputed? This only marks it for review — it does NOT reverse the on-chain outcome. Manual dev/ops follow-up is required afterward.',
                          )
                        ) {
                          disputeAutoResolveMutation.mutate();
                        }
                      }}
                      disabled={disputeAutoResolveMutation.isPending}
                      className="touch-hit rounded-[3px] border border-danger/40 px-1.75 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-danger transition-colors hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {disputeAutoResolveMutation.isPending
                        ? 'Disputing…'
                        : 'Dispute'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Chart */}
            <div className="px-[18px] pb-[18px] pt-4 relative">
              {hoverData && (
                <div
                  className="absolute top-0 pointer-events-none flex flex-col items-center z-10"
                  style={{
                    left: `calc(18px + ${(hoverData.x / 740) * 100}%)`,
                    transform: 'translateX(-50%)',
                  }}
                >
                  <div className="rounded-[4px] border border-border bg-background/95 px-2 py-1.5 text-center shadow-md backdrop-blur-sm mb-1 whitespace-nowrap">
                    <div className="flex gap-3">
                      <div className="flex flex-col items-start gap-0.5">
                        <span className="font-mono text-[9px] font-bold text-success">
                          {yesLabel.toUpperCase()}
                        </span>
                        <span className="font-mono text-[11px] font-semibold">
                          {pctPair(hoverData.priceYes).yes}
                        </span>
                      </div>
                      <div className="flex flex-col items-start gap-0.5">
                        <span className="font-mono text-[9px] font-bold text-danger">
                          {noLabel.toUpperCase()}
                        </span>
                        <span className="font-mono text-[11px] font-semibold">
                          {pctPair(hoverData.priceYes).no}
                        </span>
                      </div>
                    </div>
                    <div className="mt-1 border-t border-border/50 pt-1 font-mono text-[9px] text-muted-foreground">
                      {new Date(hoverData.ts * 1000).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </div>
              )}
              <svg
                viewBox="0 0 740 240"
                preserveAspectRatio="none"
                className="block h-[240px] w-full cursor-crosshair relative z-0 touch-none select-none"
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                onTouchMove={(e) => {
                  if (e.touches[0]) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const scaleX = 740 / rect.width;
                    const svgX = (e.touches[0].clientX - rect.left) * scaleX;
                    let closest = chart.points[0];
                    let minDiff = Math.abs(svgX - closest.x);
                    for (const pt of chart.points) {
                      const diff = Math.abs(svgX - pt.x);
                      if (diff < minDiff) {
                        closest = pt;
                        minDiff = diff;
                      }
                    }
                    setHoverData(closest);
                  }
                }}
                onTouchEnd={handleMouseLeave}
              >
                <defs>
                  <linearGradient id="yG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--brand-green)" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="var(--brand-green)" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="nG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--brand-red)" stopOpacity="0.16" />
                    <stop offset="100%" stopColor="var(--brand-red)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[48, 96, 144, 192].map((y) => (
                  <line
                    key={y}
                    x1="40"
                    y1={y}
                    x2="700"
                    y2={y}
                    stroke="currentColor"
                    strokeOpacity="0.06"
                    strokeWidth="0.5"
                    strokeDasharray="2 4"
                  />
                ))}
                {(['100%', '75%', '50%', '25%'] as const).map((lbl, i) => (
                  <text
                    key={lbl}
                    x="2"
                    y={52 + i * 48}
                    fontFamily="ui-monospace,monospace"
                    fontSize="9"
                    fill="currentColor"
                    fillOpacity="0.35"
                  >
                    {lbl}
                  </text>
                ))}
                {chart.flat ? (
                  <line
                    x1="40"
                    y1="120"
                    x2="680"
                    y2="120"
                    stroke="currentColor"
                    strokeOpacity="0.25"
                    strokeWidth="1.5"
                    strokeDasharray="6 4"
                  />
                ) : (
                  <>
                    <path d={chart.noFill} fill="url(#nG)" />
                    <path
                      d={chart.noLine}
                      fill="none"
                      stroke="var(--brand-red)"
                      strokeWidth="1.5"
                    />
                    <path d={chart.yesFill} fill="url(#yG)" />
                    <path
                      d={chart.yesLine}
                      fill="none"
                      stroke="var(--brand-green)"
                      strokeWidth="1.5"
                    />
                    <circle
                      cx={chart.lastYes[0]}
                      cy={chart.lastYes[1]}
                      r="4"
                      fill="var(--brand-green)"
                      stroke="var(--background)"
                      strokeWidth="2"
                    />
                    <circle
                      cx={chart.lastNo[0]}
                      cy={chart.lastNo[1]}
                      r="4"
                      fill="var(--brand-red)"
                      stroke="var(--background)"
                      strokeWidth="2"
                    />
                  </>
                )}
                {hoverData && (
                  <>
                    <line
                      x1={hoverData.x}
                      y1="8"
                      x2={hoverData.x}
                      y2="232"
                      stroke="currentColor"
                      strokeOpacity="0.2"
                      strokeWidth="1"
                      strokeDasharray="4 4"
                    />
                    <circle
                      cx={hoverData.x}
                      cy={Math.round((1 - hoverData.priceYes) * 224 + 8)}
                      r="4"
                      fill="var(--brand-green)"
                      stroke="var(--background)"
                      strokeWidth="2"
                    />
                    <circle
                      cx={hoverData.x}
                      cy={Math.round(hoverData.priceYes * 224 + 8)}
                      r="4"
                      fill="var(--brand-red)"
                      stroke="var(--background)"
                      strokeWidth="2"
                    />
                  </>
                )}
                {!chart.flat && (
                  <>
                    <text
                      x={chart.lastYes[0] + 8}
                      y={
                        chart.lastYes[1] === chart.lastNo[1]
                          ? chart.lastYes[1] - 8
                          : chart.lastYes[1] + 4
                      }
                      fontFamily="ui-monospace,monospace"
                      fontSize="9"
                      fill="var(--brand-green)"
                      fontWeight="700"
                    >
                      {yesLabel.toUpperCase()}{' '}
                      {pctPair(poolState.priceYes).yes}
                    </text>
                    <text
                      x={chart.lastNo[0] + 8}
                      y={
                        chart.lastYes[1] === chart.lastNo[1]
                          ? chart.lastNo[1] + 14
                          : chart.lastNo[1] + 4
                      }
                      fontFamily="ui-monospace,monospace"
                      fontSize="9"
                      fill="var(--brand-red)"
                      fontWeight="700"
                    >
                      {noLabel.toUpperCase()}{' '}
                      {pctPair(poolState.priceYes).no}
                    </text>
                  </>
                )}
                <text
                  x="40"
                  y="236"
                  fontFamily="ui-monospace,monospace"
                  fontSize="9"
                  fill="currentColor"
                  fillOpacity="0.35"
                >
                  {new Date(createdTs * 1000).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </text>
                <text
                  x="656"
                  y="236"
                  fontFamily="ui-monospace,monospace"
                  fontSize="9"
                  fill="currentColor"
                  fillOpacity="0.35"
                >
                  Now
                </text>
              </svg>
            </div>
          </div>

          {/* Description / About + Rules + Pool info */}
          <div
            className={`${showOnMobile('chart')} max-lg:order-3 rounded-[10px] border border-border bg-card overflow-hidden`}
          >
            {market.description && (
              <div className="px-[18px] py-4">
                <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  About
                </div>
                <MarketDescriptionContent
                  value={market.description}
                  className="text-[13px] text-muted-foreground"
                />
              </div>
            )}
            {market.rules && (
              <RulesResolutionCard
                rules={market.rules}
                outcome={market.suggestedOutcome}
                yesLabel={yesLabel}
                noLabel={noLabel}
              />
            )}
            {/* Pool / Creator grid */}
            <div
              className={`grid grid-cols-2${market.description || market.rules ? ' border-t border-border' : ''}`}
            >
              {[
                { label: 'Pool', value: shortAddr(poolAddress, 8, 6) },
                {
                  label: 'Creator',
                  value: shortAddr(pool.creator.toBase58(), 8, 6),
                },
              ].map((item, i, arr) => (
                <div
                  key={item.label}
                  className={`flex flex-col gap-0.5 px-[18px] py-3${i < arr.length - 1 ? ' border-r border-border' : ''}`}
                >
                  <span className="font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    {item.label}
                  </span>
                  <span className="font-mono text-[11px] font-semibold text-foreground">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Trades history */}
          <div
            className={`${showOnMobile('chart')} max-lg:order-2 rounded-[10px] border border-border bg-card overflow-hidden`}
          >
            <div className="flex items-center gap-2 px-[18px] py-3 border-b border-border">
              <span className="text-[12.5px] font-semibold">
                Trades history
              </span>
              <span className="flex items-center gap-1 font-mono text-[8.5px] text-success">
                <span className="text-[7px]">●</span> live
              </span>
            </div>
            <div className="overflow-x-auto">
              <div
                className="grid gap-x-2 px-[18px] py-2 bg-background border-b border-border font-mono text-[8.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground"
                style={{
                  gridTemplateColumns: '60px 88px 84px 1fr 56px 76px',
                  minWidth: '460px',
                }}
              >
                <span>Time</span>
                <span>Trader</span>
                <span className="text-right">Side</span>
                <span className="text-right">Shares</span>
                <span className="text-right">Price</span>
                <span className="text-right">Tx</span>
              </div>
              {trades.length === 0 ? (
                <div className="py-8 text-center font-mono text-[11px] text-muted-foreground">
                  No trades yet
                </div>
              ) : (
                trades.map((t, i) => (
                  <div
                    key={t.txSig || i}
                    className="grid items-center gap-x-2 px-[18px] py-2 border-b border-border last:border-0 font-mono text-[11px]"
                    style={{
                      gridTemplateColumns: '60px 88px 84px 1fr 56px 76px',
                      minWidth: '460px',
                    }}
                  >
                    <span className="text-muted-foreground text-[10.5px]">
                      {t.time} ago
                    </span>
                    <span className="truncate text-foreground font-medium">
                      {t.handle}
                    </span>
                    <span className="flex items-center justify-end gap-1">
                      <span
                        className={`font-bold ${t.isYes ? 'text-success' : 'text-danger'}`}
                      >
                        {t.outcome}
                      </span>
                      <span
                        className={`rounded-[3px] px-[4px] py-0.5 text-[8px] font-bold ${t.isBuy ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'}`}
                      >
                        {t.action}
                      </span>
                    </span>
                    <span className="text-right text-muted-foreground">
                      {t.shares}
                    </span>
                    <span className="text-right font-semibold text-foreground">
                      {t.price}
                    </span>
                    <a
                      href={t.solscanUrl}
                      target="_blank"
                      rel="noreferrer"
                      title={`View ${t.txSig} on Solscan`}
                      className="flex items-center justify-end gap-1 text-[10.5px] text-primary hover:underline"
                    >
                      {t.txShort}
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  </div>
                ))
              )}
            </div>
            {/* /overflow-x-auto */}
            {/* Pagination */}
            {(tradePage > 1 || tradesHasNext) && (
              <div className="flex items-center justify-between gap-2 px-[18px] py-2 border-t border-border font-mono text-[9.5px]">
                <button
                  onClick={() => setTradePage((p) => Math.max(1, p - 1))}
                  disabled={tradePage <= 1}
                  className="touch-hit cursor-pointer rounded-[4px] border border-border px-2 py-0.5 transition-colors hover:bg-muted/30 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Prev
                </button>
                <span className="text-muted-foreground">Page {tradePage}</span>
                <button
                  onClick={() =>
                    setTradePage((p) => (tradesHasNext ? p + 1 : p))
                  }
                  disabled={!tradesHasNext}
                  className="touch-hit cursor-pointer rounded-[4px] border border-border px-2 py-0.5 transition-colors hover:bg-muted/30 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </div>

          {/* Bonus XP Awards — admin only, shown when market has isBonusXp */}
          {market.isBonusXp && user?.isAdmin && (
            <BonusXpAwardsTable
              marketId={poolAddress}
              isResolved={isResolved}
              className={showOnMobile('chart')}
            />
          )}
        </div>

        {/* ── Col 2: how-to + order ticket ── */}
        <div className="max-lg:contents lg:flex lg:flex-col lg:gap-3.5">
          {/* How this resolves */}
          <div
            className={`${showOnMobile('chart')} max-lg:order-4 rounded-[10px] border border-border bg-card overflow-hidden`}
          >
            <button
              className="flex w-full cursor-pointer items-center gap-2.5 px-4 py-[13px] text-left transition-colors hover:bg-muted/20"
              onClick={() => setHowOpen(!howOpen)}
            >
              <div className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[5px] bg-brand-purple text-[11px] font-bold text-white">
                P
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-semibold">
                  How resolution work?
                </div>
                <div className="mt-0.5 truncate font-mono text-[10.5px] text-muted-foreground">
                  {new Date(expiryTs * 1000).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                  {' · On-chain resolver · Permissionless'}
                </div>
              </div>
              <ChevronDown
                className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150 ${howOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {howOpen && (
              <div className="border-t border-border px-4 pb-4">
                <p className="mt-3 mb-3 text-[11.5px] leading-[1.6] text-muted-foreground">
                  After expiry a AI agents DAO with minimum threshold of 2/3
                  will submits the winning side on-chain. Winning outcome{' '}
                  {poolState.marketVersion === 'v2_position'
                    ? 'position'
                    : 'token'}{' '}
                  holders redeem 1:1 for {collateralSymbol} collateral. No human
                  voting, no oracle bribery.
                </p>
                {isResolved && (
                  <div
                    className={`mb-3 flex items-center gap-2 rounded-[6px] border px-2.5 py-2 text-[11px] ${
                      effectiveResolutionCode === 1
                        ? 'border-success/30 bg-success/10 text-success'
                        : 'border-danger/30 bg-danger/10 text-danger'
                    }`}
                  >
                    <span className="font-mono text-[8.5px] font-bold uppercase tracking-[0.12em] opacity-70">
                      AI resolved
                    </span>
                    <span className="font-mono text-[12px] font-black">
                      {(effectiveResolutionCode === 1
                        ? yesLabel
                        : noLabel
                      ).toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="mb-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Info className="h-3 w-3 shrink-0" />
                  <span>
                    Settlement by AI agent may take up to 24 hours after expiry.
                  </span>
                </div>
                <div className="mb-[10px] flex gap-[6px]">
                  <div className="flex-1 rounded-[6px] border border-border bg-background px-[10px] py-2">
                    <div className="mb-[3px] font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      Brain
                    </div>
                    <div className="break-all font-mono text-[11px] font-bold text-brand-purple">
                      {resolverShort}
                    </div>
                  </div>
                  <div className="flex-1 rounded-[6px] border border-border bg-background px-[10px] py-2">
                    <div className="mb-[3px] font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      Collateral
                    </div>
                    <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-primary">
                      {collateralToken?.image && (
                        <img
                          src={collateralToken.image}
                          alt={collateralSymbol}
                          className="size-3.5 rounded-full"
                        />
                      )}
                      {collateralSymbol}
                    </div>
                  </div>
                </div>
                {isMethodologyEnabled && (
                  <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[11px] text-primary hover:underline"
                  >
                    Read methodology →
                  </a>
                )}
              </div>
            )}

            {/* Static footer — always visible, not part of the collapse, so
                someone who just noticed the event already happened can act on
                it without hunting. Opens the early-resolve petition, which is
                a different mechanism from the toolbar's admin Report. */}
            {market.status === 'active' &&
              !isResolved &&
              !isCancelled &&
              !isExpiredUnresolved && (
                <div className="border-t border-border">
                  <EarlyResolveRequest
                    marketId={market.id}
                    poolAddress={poolAddress}
                    marketQuestion={market.question}
                    isCreator={isCreator}
                    enabled
                  />
                </div>
              )}
          </div>

          {/* AI ensemble result — per-model votes (below How this resolves) */}
          <div className={`${showOnMobile('chart')} max-lg:order-5`}>
            <EnsembleResultCard marketId={poolAddress} kind="pamm" />
          </div>

          {/* Trade panel — desktop only */}
          <div className="hidden lg:block">
            {showRedeemPanel ? (
              <RedeemPanel
                poolState={poolState}
                poolAddress={poolAddress}
                yesLabel={yesLabel}
                noLabel={noLabel}
              />
            ) : (
              <SwapPanel
                key={linkSide ?? 'yes'}
                initialSide={linkSide}
                poolState={poolState}
                poolAddress={poolAddress}
                question={market.question}
                yesLabel={market.yesLabel}
                noLabel={market.noLabel}
                cancelled={isCancelled}
                underReview={market.moderationStatus === 'under_review'}
                resolving={isResolving}
                tradingPaused={isTradingPaused}
                bannedFromTrading={bannedFromTrading}
              />
            )}
          </div>
        </div>

        {/* ── Col 3: stream tile + roast feed + LP ── */}
        <div
          className={`${showOnMobile('stream')} lg:col-span-2 xl:col-span-1 relative flex flex-col gap-3.5`}
        >
          {streamTokenData?.token ? (
            <LiveKitRoom
              key={sessionKey}
              token={streamTokenData.token}
              serverUrl={livekitUrl}
              connect={true}
              video={false}
              audio={false}
            >
              <div className="flex flex-col gap-3.5 h-full">
                <MarketStreamCard
                  marketId={poolAddress}
                  mode={isCreator ? 'broadcaster' : 'viewer'}
                  onStop={() => setSessionKey((k: number) => k + 1)}
                  canAdminStop={isAdminOnly}
                  onAdminStop={async () => {
                    await pammMarketService.stopStream(poolAddress);
                    setSessionKey((k: number) => k + 1);
                  }}
                  sidebar={
                    <RoastFeed yesPercent={yesPercent} yesLabel={yesLabel} />
                  }
                />
              </div>
            </LiveKitRoom>
          ) : (
            <div className="flex flex-col gap-3.5 opacity-40 select-none pointer-events-none lg:flex-row xl:flex-col [&>*]:flex-1">
              <div className="rounded-[10px] border border-border bg-card overflow-hidden aspect-video flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
              <div className="rounded-[10px] border border-border bg-card h-[400px] flex items-center justify-center">
                <span className="font-mono text-[11px]">Loading feed...</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Mobile sticky bottom bar ── */}
      <div className="lg:hidden fixed bottom-(--mobile-nav-h) inset-x-0 z-30">
        <div className="absolute -top-10 inset-x-0 h-10 bg-linear-to-t from-background to-transparent pointer-events-none" />
        <div className="bg-card/98 backdrop-blur-xl border-t border-white/5 px-4 py-3 flex items-center gap-4">
          {/* YES/NO split bar + labels */}
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex h-0.75 rounded-full overflow-hidden">
              <div
                className="bg-success"
                style={{ width: `${yesPercent}%` }}
              />
              <div className="bg-danger flex-1" />
            </div>
            <div className="flex justify-between items-baseline">
              <div className="flex items-baseline gap-1">
                <span className="font-mono text-[13px] font-black text-success leading-none">
                  {pctPair(poolState.priceYes).yes}
                </span>
                <span className="font-mono text-[8.5px] font-bold text-success/50 uppercase tracking-widest">
                  {yesLabel}
                </span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="font-mono text-[8.5px] font-bold text-danger/50 uppercase tracking-widest">
                  {noLabel}
                </span>
                <span className="font-mono text-[13px] font-black text-danger leading-none">
                  {pctPair(poolState.priceYes).no}
                </span>
              </div>
            </div>
          </div>
          {/* CTA */}
          <button
            type="button"
            onClick={() => setTradeOpen(true)}
            className={`shrink-0 h-11 rounded-full px-7 font-mono text-[11px] font-black uppercase tracking-widest transition-all duration-150 active:scale-[0.95] active:brightness-90 ${
              isResolved
                ? 'bg-warning text-black shadow-lg shadow-warning/25'
                : isResolving || isTradingPaused
                  ? 'bg-muted text-muted-foreground'
                  : 'bg-primary text-white shadow-lg shadow-primary/30'
            }`}
          >
            {isResolved
              ? 'Redeem'
              : isCancelled
                ? 'Reclaim'
                : isResolving
                  ? 'Resolving'
                  : isTradingPaused
                    ? 'Paused'
                    : 'Trade ↗'}
          </button>
        </div>
      </div>

      {/* ── Mobile trade bottom sheet ── */}
      <Drawer open={tradeOpen} onOpenChange={setTradeOpen} direction="bottom">
        <DrawerContent className="flex flex-col border-border bg-card max-h-[92dvh]">
          <DrawerTitle className="sr-only">
            {isResolved ? 'Redeem' : 'Trade'}
          </DrawerTitle>
          <DrawerDescription className="sr-only">
            {isResolved ? 'Redeem your position' : 'Trade on this market'}
          </DrawerDescription>
          {/* Market pill */}
          <div className="px-4 pb-3 shrink-0">
            <div className="flex items-center gap-2 rounded-xl bg-muted/30 px-3 py-2">
              <span
                className={`shrink-0 rounded-lg px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-widest ${
                  isResolved
                    ? effectiveResolutionCode === 1
                      ? 'bg-success/15 text-success'
                      : 'bg-danger/15 text-danger'
                    : isCancelled
                      ? 'bg-danger/15 text-danger'
                      : 'bg-primary/15 text-primary'
                }`}
              >
                {isResolved
                  ? effectiveResolutionCode === 1
                    ? yesLabel
                    : noLabel
                  : isCancelled
                    ? 'Cancelled'
                    : isResolving
                      ? 'Resolving'
                      : 'Live'}
              </span>
              <span className="text-[12px] font-medium leading-snug line-clamp-1 text-foreground/80">
                {market.question}
              </span>
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {showRedeemPanel ? (
              <RedeemPanel
                poolState={poolState}
                poolAddress={poolAddress}
                yesLabel={yesLabel}
                noLabel={noLabel}
              />
            ) : (
              <SwapPanel
                key={linkSide ?? 'yes'}
                initialSide={linkSide}
                poolState={poolState}
                poolAddress={poolAddress}
                question={market.question}
                yesLabel={market.yesLabel}
                noLabel={market.noLabel}
                cancelled={isCancelled}
                underReview={market.moderationStatus === 'under_review'}
                resolving={isResolving}
                tradingPaused={isTradingPaused}
                bannedFromTrading={bannedFromTrading}
              />
            )}
          </div>
        </DrawerContent>
      </Drawer>

    </>
  );
}
