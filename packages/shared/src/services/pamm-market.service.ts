import { getNearMarket, getNearPaused, getNearUserClaims, getNearUserMarkets } from '@/lib/near/contract';
import { USDC_DECIMALS, USDC_SYMBOL } from '@/lib/near/config';
import { listNearMarkets } from '@/lib/near/market-list';
import { claimRows, positionRows, toPammMarket } from '@/lib/near/map';
import { useNearWallet } from '@/store/near-wallet.store';
import type { MarketRules } from './market.service';
import type { Category } from './categories.service';
import type { PammMarketVersion, PammPositionModel } from './pamm/market-be';
import type { PublicResolution } from '@/types/resolution';

export type PammMarketStatus =
  | 'pending'
  | 'pending_approval'
  | 'active'
  | 'pending_resolution'
  | 'pending_resolve_review'
  | 'resolved'
  | 'cancelled';

export type PammMarketResolution = 'yes' | 'no';

/**
 * AI ensemble verdict. `invalid` means "not determinable from the declared
 * source" — the market cancels and refunds, it is not a failure state.
 */
export type PammAiVerdict = 'yes' | 'no' | 'invalid';

export type PammMarketSort =
  | 'newest'
  | 'ending'
  | 'volume'
  | 'orders'
  | 'participants';

export type PammTradeSide =
  | 'buy_yes'
  | 'buy_no'
  | 'sell_yes'
  | 'sell_no'
  | 'seed';

export interface PammMarket {
  id: string;
  question: string;
  description?: string | null;
  thumbnail?: { id: string; path: string } | null;
  thumbnailId?: string | null;
  tweetUrl?: string | null;
  creatorId: string;
  yesLabel: string;
  noLabel: string;
  /** Parent group this market belongs to, if any (multi-candidate events). */
  groupId?: string | null;
  /** Display label of this market as an option within its group (e.g. "Trump"). */
  groupOptionLabel?: string | null;
  category?: Category | null;
  categoryId?: string | null;
  collateralMint?: string | null;
  marketVersion: PammMarketVersion;
  positionModel: PammPositionModel;
  yesMint?: string | null;
  noMint?: string | null;
  lpMint?: string | null;
  status: PammMarketStatus;
  resolution: PammMarketResolution | null;
  latestPriceYes: number;
  expiryTs: number | string;
  /**
   * Seconds after resolution before winners may redeem, snapshotted from the
   * pool. Null on markets created before the BE stored it — callers fall back
   * to PAMM_CLAIM_DELAY_FALLBACK_SECS.
   */
  claimDelaySecs?: number | null;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  selectedAiModels?: string[] | null;
  rules?: MarketRules | null;
  suggestedOutcome?: string | null;
  suggestionConfidence?: number | null;
  suggestionReasoning?: string | null;
  suggestId?: string | null;
  /**
   * Source the creator declared at creation time — the AI oracle resolves the
   * market primarily against this. Required for creator/KOL markets (see
   * `CreateKolMarketPayload.resolutionSourceUrl`).
   */
  resolutionSourceUrl?: string | null;
  /**
   * The AI ensemble's verdict. `invalid` is a *valid* conclusion, not an
   * error: the outcome could not be determined from the declared source, so
   * the market cancels and everyone is refunded.
   */
  aiVerdict?: PammAiVerdict | null;
  /**
   * Outcome the market will settle to once the creator-dispute window lapses.
   * Null when `aiVerdict === 'invalid'` — nobody wins there.
   */
  pendingResolution?: 'yes' | 'no' | null;
  /** When the AI produced its verdict — the start of the dispute window. */
  aiResolvedAt?: string | null;
  /**
   * Hard deadline for the creator to report a wrong result. Server-computed:
   * the window length is configurable (PAMM_CREATOR_DISPUTE_WINDOW_HOURS), so
   * never derive it by adding 24h to `aiResolvedAt`.
   */
  creatorDisputeUntil?: string | null;
  creatorDisputed?: boolean;
  creatorDisputedAt?: string | null;
  creatorDisputeReason?: string | null;
  creatorDisputeEvidenceUrl?: string | null;
  /**
   * True = this market never auto-settles; a human admin has to decide. There
   * is no deadline attached, so don't render a countdown for it.
   */
  requiresAdminReview?: boolean;
  /**
   * Trading halt from the trader early-resolve petition. The market stays
   * `active` — it keeps its price and stays in the public list — so this flag,
   * not `status`, is what tells the UI to stop taking trades. Cleared when an
   * admin either closes the market for real or rejects the petition.
   */
  tradingPausedAt?: string | null;
  tradingPausedReason?: string | null;
  /** Set when the market was pushed into resolution ahead of `expiryTs`. */
  earlyResolveTriggeredAt?: string | null;
  /** `'creator'` or `'traders:3/10'`. */
  earlyResolveTriggeredBy?: string | null;
  resolveApprovalCount?: number;
  isBonusXp?: boolean;
  /**
   * Global trading-pause flag (whole exchange, not per-market). When `true`,
   * all Buy/Sell/Redeem actions are halted. Mirrored on the list, detail and
   * realtime endpoints so any of them can drive the paused UI.
   */
  isPaused?: boolean;
  // aggregated stats (populated by list endpoint)
  tradeCount?: number;
  uniqueTraderCount?: number;
  totalVolumeUsdc?: number;
  creatorShareBps?: number;
  /**
   * Moderation state, orthogonal to `status`. When set to `under_review`
   * an admin has flagged the market pending review — trading is halted at the
   * BE/UI layer (sell + refund still allowed). Cleared to `clear` on unlock.
   */
  moderationStatus?: PammMarketModerationStatus;
  moderationReason?: PammMarketModerationReason | null;
  moderationStartedAt?: string | null;
  moderationStartedBy?: string | null;
  moderationRefId?: string | null;
  /**
   * `true` once an admin approves a Trending request — permanent unless an
   * admin unfeatures it. Does NOT by itself mean the market is currently on
   * the public Trending feed: a resolved/cancelled/expired market keeps this
   * flag `true` in the DB but is excluded from `?isTrending=true` results.
   * Always filter server-side rather than relying on this field client-side.
   */
  isTrending?: boolean;
  /** ISO date the market was approved for Trending, if ever. */
  trendingAt?: string | null;
}

export type PammMarketModerationStatus =
  | 'clear'
  | 'under_review'
  | 'verified_clean';

export type PammMarketModerationReason =
  | 'community_report'
  | 'ai_flag'
  | 'admin_manual'
  | 'content_filter'
  | 'price_manipulation'
  | 'duplicate_flag';

export type PammTradeStatus = 'open' | 'won' | 'lost' | 'claimed' | 'closed';

export interface PammMarketTrade {
  id: string;
  txSig: string;
  marketId: string;
  userId?: string | null;
  side: PammTradeSide;
  status?: PammTradeStatus;
  amountIn: string;
  /**
   * Raw units out. Outcome tokens for v1/v2 (redeemable 1:1), but **share
   * counts** for v3 — a v3 share is not worth 1 collateral at resolution, so
   * never treat this as a payout there.
   */
  amountOut: string;
  /**
   * Raw token units still redeemable after netting sells against buys at
   * resolution (set by the backend). Redeem this instead of `amountOut` for a
   * winning position so a partially sold-back position never over-redeems.
   * Null/absent until resolved or when not applicable.
   */
  redeemableAmount?: string | null;
  /**
   * V3 only — how the pool ACTUALLY settled on-chain (`PoolV3.mode`), which
   * the market row cannot answer: a one-sided market auto-cancels into a
   * refund even when the row records a winner. Null when not V3 or the pool
   * could not be read — treat null as unknown and fall back to market status.
   */
  settlement?: 'unresolved' | 'resolved' | 'auto_cancelled' | null;
  /**
   * Which instruction this position must call to get paid. `refund` is the
   * auto-cancelled path and applies to BOTH sides; `redeem` only to the
   * winning side. Calling the wrong one reverts on-chain, so this — not the
   * trade status — is what the claim button should follow.
   */
  claimAction?: 'redeem' | 'refund' | null;
  /** Set once paid out: a redeem was a right call, a refund neither. */
  claimKind?: 'redeem' | 'refund';
  /**
   * Collateral owed, raw base units. Real money, unlike `redeemableAmount`
   * (a SHARE COUNT on V3) — safe to format as an amount.
   */
  claimAmount?: string | null;
  /**
   * Raw token units still held by this buy after netting out sells —
   * resolution-independent, unlike `redeemableAmount` (claim-specific, only
   * set post-resolution). Null until a sell has ever netted against this
   * buy, meaning the full `amountOut` is still held.
   */
  heldAmount?: string | null;
  priceYes: number;
  volumePxpEquivalent: number;
  /**
   * Whatever the pool counts per side after the trade: real reserves for v2,
   * **share counts** for v3 (which has no reserves). Never recompute a price
   * from these two — use `priceYes`, which the backend stores separately.
   */
  yesReserveAfter: string;
  noReserveAfter: string;
  traderAddress: string;
  createdAt: string;
  updatedAt?: string;
  // populated by my-trades endpoint
  market?: PammMarket | null;
}

export interface ListPammMarketsParams {
  status?: PammMarketStatus;
  search?: string;
  sort?: PammMarketSort;
  order?: 'asc' | 'desc';
  minVolume?: number;
  maxVolume?: number;
  page?: number;
  limit?: number;
  categoryId?: string;
  /** Server-side excludes closed markets even though `isTrending` stays `true` on them — see {@link PammMarket.isTrending}. */
  isTrending?: boolean;
}

/** One member row inside a `kind: 'group'` list item — a lighter summary
 * than `GroupMemberMarket` (no `priceHistory`/`question`). */
export interface PammGroupListMember {
  marketId: string;
  source: 'predit' | 'pamm';
  optionLabel: string;
  sortOrder: number;
  yesPrice: number;
  status: string;
  /** Pool collateral mint — only populated for `source: 'pamm'` members. */
  collateralMint?: string | null;
  /** pamm: live buy-side volume from trades. predit: yesPool + noPool. */
  volumeUsdc?: number;
  /** pamm: distinct traders (excl. seed). predit: denormalized totalParticipants. */
  participantCount?: number;
}

export interface PammGroupListSummary {
  id: string;
  slug: string;
  title: string;
  status: string;
  isActive: boolean;
  imageUrl?: string | null;
  /** Plain sum of each candidate's volumeUsdc — not deduped across candidates. */
  totalVolumeUsdc?: number;
  /** Plain sum of each candidate's participantCount — not deduped across candidates. */
  participantCount?: number;
  /** MIN(closeAt) across all still-open candidates; absent until BE ships it on this list endpoint. */
  closeAt?: string | null;
  markets: PammGroupListMember[];
}

/**
 * A listing row is either a standalone market or a whole group collapsed
 * into one entry (grouped candidate markets no longer appear as separate
 * rows in the listing — see market-group-pamm-batch-guide.md).
 */
export type PammMarketListItem =
  | { kind: 'market'; market: PammMarket }
  | { kind: 'group'; group: PammGroupListSummary };

export interface ListPammMarketsResponse {
  data: PammMarketListItem[];
  hasNextPage: boolean;
  total: number;
}

export interface ListPammTradesParams {
  page?: number;
  limit?: number;
}

export interface MyPammTradesParams {
  page?: number;
  limit?: number;
}

export interface ListPammTradesResponse {
  data: PammMarketTrade[];
  hasNextPage: boolean;
  total: number;
}

export interface PammMarketRealtime {
  latestPriceYes: number;
  latestTrades: PammMarketTrade[];
  /** Global trading-pause flag (whole exchange). See {@link PammMarket.isPaused}. */
  isPaused?: boolean;
}

/** Every side of every position the connected account holds, newest market first. */
const myNearPositionRows = async (): Promise<PammMarketTrade[]> => {
  const accountId = useNearWallet.getState().accountId;
  if (!accountId) return [];
  const [held, claims] = await Promise.all([getNearUserMarkets(accountId), getNearUserClaims(accountId)]);
  return held
    .flatMap(([market, position]) => {
      const claim = claims.get(market.id);
      return [...positionRows(market, position), ...(claim ? claimRows(market, position, claim) : [])];
    })
    .reverse();
};

export const getPammMarkets = (params?: ListPammMarketsParams): Promise<ListPammMarketsResponse> =>
  listNearMarkets(params);

export const getPammMarketById = async (id: string): Promise<PammMarket> => {
  const market = await getNearMarket(id);
  if (!market) throw new Error('Market not found');
  return toPammMarket(market);
};


/**
 * Fetch just the global circuit-breaker flag. Cheaper than the market list;
 * every trading surface (banner, swap, redeem) polls this instead of
 * scraping `isPaused` off the first market row.
 */
export const getPammGlobalPause = async (): Promise<{
  isPaused: boolean;
  refreshedAt: number;
}> => ({ isPaused: await getNearPaused(), refreshedAt: Date.now() });


export const getPammMarketResolution = async (
  _id: string,
): Promise<PublicResolution | null> => null;


export const getPammMarketRealtime = async (id: string): Promise<PammMarketRealtime> => {
  const [market, isPaused] = await Promise.all([getNearMarket(id), getNearPaused()]);
  return { latestPriceYes: (market?.price_yes_bps ?? 5000) / 10_000, latestTrades: [], isPaused };
};


export const getPammMarketTrades = async (
  _id: string,
  _params?: ListPammTradesParams,
): Promise<ListPammTradesResponse> => ({ data: [], hasNextPage: false, total: 0 });

/**
 * Progress of the "resolve this early" petition. Auth is optional — without a
 * JWT the counts still come back, only `hasRequested` degrades to false.
 */

/**
 * Ask for the market to be resolved before its deadline. Only traders who
 * actually traded this market may call it, once each (409 on a repeat). Once
 * `thresholdPct` of traders have asked, the backend closes trading and runs
 * the AI ensemble — poll the market until it leaves `pending_resolution`.
 */
export interface CollateralBreakdown {
  totalValue: number;
  totalPnL: number;
  sparkline: number[];
  // True when a settled position's payout couldn't be read from chain at
  // settlement time; the BE cron self-heals it within ~10-20 min, so treat
  // totalValue/totalPnL for this collateral as provisional until it clears.
  hasPendingData: boolean;
}

/**
 * The money figures here — `totalValue`, `totalPnL`, `pnlPct`, `sparkline` —
 * are denominated in ONE collateral, named by `headlineSymbol`. Label them
 * with that, never a hardcoded 'USDC': they were previously a sum across every
 * collateral displayed as USDC, which added PXP to USDC even though no PXP→USD
 * rate exists. Anything that must cover every currency reads `byCollateral`.
 *
 * The counts (`openCount`, `wins`, `losses`, `totalTrades`, `winRate`) are
 * unit-free and do span all collaterals.
 */
export interface PammMarketSummary {
  totalValue: number;
  totalPnL: number;
  pnlPct: number;
  openCount: number;
  wins: number;
  losses: number;
  totalTrades: number;
  winRate: number;
  sparkline: number[];
  /** Mint the headline figures are denominated in; null if none configured. */
  headlineMint?: string | null;
  /** Ticker to label the headline figures with. Falls back to 'USDC'. */
  headlineSymbol?: string | null;
  // See CollateralBreakdown.hasPendingData — true if any collateral is pending.
  hasPendingData: boolean;
  byCollateral?: Record<string, CollateralBreakdown>;
}


export const getMyPammTrades = async (
  params?: MyPammTradesParams,
): Promise<ListPammTradesResponse> => {
  const rows = await myNearPositionRows();
  const page = params?.page ?? 1;
  const limit = params?.limit ?? 20;
  const start = (page - 1) * limit;
  return {
    data: rows.slice(start, start + limit),
    hasNextPage: start + limit < rows.length,
    total: rows.length,
  };
};


export const getMyPammSummary = async (): Promise<PammMarketSummary> => {
  const all = await myNearPositionRows();
  // Paid-out rows are history: their money is back in the wallet.
  const rows = all.filter((r) => r.status !== 'claimed');
  const stake = (r: PammMarketTrade) => Number(r.amountIn) / 10 ** USDC_DECIMALS;
  const value = (r: PammMarketTrade) =>
    r.status === 'lost' ? 0 : r.claimAmount != null ? Number(r.claimAmount) / 10 ** USDC_DECIMALS : stake(r);
  const totalValue = rows.reduce((sum, r) => sum + value(r), 0);
  const wins = rows.filter((r) => r.status === 'won').length + all.filter((r) => r.claimKind === 'redeem').length;
  const losses = rows.filter((r) => r.status === 'lost').length;
  const settled = wins + losses;
  const cost = rows.reduce((sum, r) => sum + stake(r), 0);
  return {
    totalValue,
    totalPnL: totalValue - cost,
    pnlPct: cost > 0 ? ((totalValue - cost) / cost) * 100 : 0,
    openCount: rows.filter((r) => r.status === 'open').length,
    wins,
    losses,
    totalTrades: all.length,
    winRate: settled > 0 ? (wins / settled) * 100 : 0,
    sparkline: [],
    headlineSymbol: USDC_SYMBOL,
    hasPendingData: false,
  };
};


export const pammMarketService = {
  getMarkets: getPammMarkets,
  getMarketById: getPammMarketById,
  getResolution: getPammMarketResolution,
  getRealtime: getPammMarketRealtime,
  getTrades: getPammMarketTrades,
  getMyTrades: getMyPammTrades,
  getMySummary: getMyPammSummary,
};
