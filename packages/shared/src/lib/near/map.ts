import BN from 'bn.js';
import type { PoolStateResult } from '@/hooks/pamm/use-pool-state';
import type {
  PammMarket,
  PammMarketStatus,
  PammMarketTrade,
} from '@/services/pamm-market.service';
import { NearAddress } from './address';
import { NEAR_MARKET_CONTRACT, NEAR_USDC_CONTRACT, USDC_DECIMALS } from './config';
import type { NearMarket, NearOutcome, NearPosition, NearPost, NearSide } from './types';

const iso = (sec: string | number) => new Date(Number(sec) * 1000).toISOString();

export const nowSec = () => Math.floor(Date.now() / 1000);

/** The winning side, once a market has settled with one. */
export function winnerOf(m: NearMarket): NearSide | null {
  if (m.status !== 'finalized' || m.refunds_only) return null;
  return m.outcome === 'yes' || m.outcome === 'no' ? m.outcome : null;
}

export function statusOf(m: NearMarket): PammMarketStatus {
  switch (m.status) {
    case 'open':
      return nowSec() < Number(m.rules.expiry_sec) ? 'active' : 'pending_resolution';
    case 'receipt_posted':
    case 'challenged':
      return 'pending_resolve_review';
    case 'cancelled':
      return 'cancelled';
    case 'finalized':
      return winnerOf(m) ? 'resolved' : 'cancelled';
  }
}

const pendingOutcome = (m: NearMarket): 'yes' | 'no' | null => {
  const outcome = m.receipt?.outcome;
  return outcome === 'yes' || outcome === 'no' ? outcome : null;
};

/** Only http(s) links reach an href: these strings are written by market creators. */
export function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

/** The tweet a market was created from, when it can be linked. */
export function postUrl(post: NearPost): string | null {
  const handle = /^x:([A-Za-z0-9_]{1,15})$/.exec(post.author_ref)?.[1];
  return post.source === 'x' && handle && /^\d+$/.test(post.post_id)
    ? `https://x.com/${handle}/status/${post.post_id}`
    : null;
}

/** Whether the contract still takes bets on this market right now. */
export const isTradable = (m: NearMarket) =>
  m.status === 'open' && nowSec() < Number(m.rules.expiry_sec) - m.trade_freeze_sec;

export function outcomeLabel(m: NearMarket, outcome: NearOutcome): string {
  if (outcome === 'yes') return m.rules.yes_label;
  if (outcome === 'no') return m.rules.no_label;
  return 'Invalid';
}

export type NearMarketPhase = 'open' | 'closed' | 'resolved' | 'cancelled';

/** Coarse phase, for filters. */
export function phaseOf(m: NearMarket): NearMarketPhase {
  if (m.status === 'cancelled') return 'cancelled';
  if (m.status === 'finalized') return winnerOf(m) ? 'resolved' : 'cancelled';
  return isTradable(m) ? 'open' : 'closed';
}

export function phaseLabel(m: NearMarket): string {
  switch (m.status) {
    case 'open':
      return isTradable(m) ? 'Open' : 'Waiting for result';
    case 'receipt_posted':
      return 'Result proposed';
    case 'challenged':
      return 'Challenged';
    case 'cancelled':
      return 'Cancelled';
    case 'finalized': {
      const winner = winnerOf(m);
      if (winner) return `Resolved ${outcomeLabel(m, winner)}`;
      // A one-sided market keeps its yes/no outcome but pays everyone back.
      return typeof m.outcome === 'object' ? 'Resolved invalid' : 'Refunded';
    }
  }
}

export type NearBondState = 'locked' | 'returned' | 'forfeited';

/** Ambiguous rules are the creator's fault, so that one outcome costs them the bond. */
export function bondStateOf(m: NearMarket): NearBondState {
  if (m.status === 'cancelled') return 'returned';
  if (m.status !== 'finalized') return 'locked';
  const outcome = m.outcome;
  return typeof outcome === 'object' && outcome?.invalid === 'ambiguous_rules' ? 'forfeited' : 'returned';
}

/** A contract market in the shape the market screens read. */
export function toPammMarket(m: NearMarket): PammMarket {
  const created = iso(m.created_at_sec);
  const posted = m.receipt ? iso(m.receipt.posted_at_sec) : null;
  return {
    id: m.id,
    question: m.rules.question,
    description: m.rules.description,
    thumbnail: m.rules.image_url ? { id: m.id, path: m.rules.image_url } : null,
    tweetUrl: m.post.source === 'x' ? `https://x.com/i/status/${m.post.post_id}` : null,
    creatorId: m.creator,
    yesLabel: m.rules.yes_label,
    noLabel: m.rules.no_label,
    category: m.rules.category
      ? ({ id: m.rules.category, slug: m.rules.category, name: m.rules.category } as PammMarket['category'])
      : null,
    categoryId: m.rules.category.toLowerCase() || null,
    collateralMint: NEAR_USDC_CONTRACT,
    marketVersion: 'v3_shares',
    positionModel: 'pda',
    status: statusOf(m),
    resolution: winnerOf(m),
    latestPriceYes: m.price_yes_bps / 10_000,
    expiryTs: Number(m.rules.expiry_sec),
    claimDelaySecs: 0,
    resolvedAt: m.status === 'finalized' ? iso(m.resolved_ts) : null,
    resolvedBy: null,
    createdAt: created,
    updatedAt: posted ?? created,
    rules: {
      outcomeRules: [
        { rule: m.rules.yes_condition, outcomeIndex: 0 },
        { rule: m.rules.no_condition, outcomeIndex: 1 },
      ],
    },
    resolutionSourceUrl: safeHttpUrl(m.rules.resolution_source),
    pendingResolution: m.status === 'finalized' ? null : pendingOutcome(m),
    aiResolvedAt: posted,
    tradeCount: m.trades,
    totalVolumeUsdc: Number(m.volume) / 10 ** USDC_DECIMALS,
    creatorShareBps: m.creator_share_bps,
    moderationStatus: 'clear',
  };
}

const bn = (value: string | number) => new BN(value.toString());

/** A contract market in the shape the trade panel reads. */
export function toPoolState(m: NearMarket): PoolStateResult {
  const none = new NearAddress('');
  const winner = winnerOf(m);
  const refunds = m.status === 'cancelled' || (m.status === 'finalized' && !winner);
  return {
    marketVersion: 'v3_shares',
    positionModel: 'pda',
    poolAddress: new NearAddress(NEAR_MARKET_CONTRACT),
    pool: {
      bump: 0,
      initSeed: none,
      collateralMint: new NearAddress(NEAR_USDC_CONTRACT),
      collateralDecimals: USDC_DECIMALS,
      yesMint: none,
      noMint: none,
      lpMint: none,
      liquidityParamRaw: bn(m.virtual_liquidity_l),
      liquidityParamInitialRaw: bn(m.virtual_liquidity_l),
      createdTs: bn(m.created_at_sec),
      expiryTs: bn(m.rules.expiry_sec),
      tradingFeeBps: m.trade_fee_bps,
      lpShareBps: 0,
      feeSolAmount: bn(0),
      isDynamic: false,
      resolutionCode: winner === 'yes' ? 1 : winner === 'no' ? 2 : 0,
      totalLpSupply: bn(0),
      seeded: true,
      creator: new NearAddress(m.creator),
      creatorShareBps: m.creator_share_bps,
      cancelled: refunds,
    },
    yesVaultBalance: BigInt(m.yes_shares),
    noVaultBalance: BigInt(m.no_shares),
    collateralVaultBalance: BigInt(m.pool_collateral),
    priceYes: m.price_yes_bps / 10_000,
    lEffective: Number(m.virtual_liquidity_l) / 10 ** USDC_DECIMALS,
    v3: {
      yesShares: BigInt(m.yes_shares),
      noShares: BigInt(m.no_shares),
      poolCollateral: BigInt(m.pool_collateral),
      virtualLiquidityL: BigInt(m.virtual_liquidity_l),
      totalYesCostAcc: BigInt(m.total_yes),
      totalNoCostAcc: BigInt(m.total_no),
      tradeFeeBps: m.trade_fee_bps,
      redeemFeeBps: m.redeem_fee_bps,
      tradeFreezeSeconds: m.trade_freeze_sec,
      claimDelaySecs: 0,
      resolvedTs: Number(m.resolved_ts),
      resolvedPoolCollateral: BigInt(m.resolved_pool_collateral),
      resolvedXWin: BigInt(m.resolved_x_win),
      resolvedWinShares: 0n,
      resolvedRedeemFeeBps: m.resolved_redeem_fee_bps,
    },
  };
}

/** What a winning stake pays out, after the redeem fee. */
export function winningPayout(m: NearMarket, cost: bigint): bigint {
  const xWin = BigInt(m.resolved_x_win);
  if (xWin === 0n) return 0n;
  const gross = (cost * BigInt(m.resolved_pool_collateral)) / xWin;
  const bps = BigInt(m.resolved_redeem_fee_bps);
  return gross - (gross * bps + 9_999n) / 10_000n;
}

function tradeRow(m: NearMarket, side: NearSide, shares: bigint, cost: bigint): PammMarketTrade {
  const winner = winnerOf(m);
  const refunds = m.status === 'cancelled' || (m.status === 'finalized' && !winner);
  const won = winner === side;
  return {
    id: `${m.id}-${side}`,
    txSig: '',
    marketId: m.id,
    side: side === 'yes' ? 'buy_yes' : 'buy_no',
    status: winner ? (won ? 'won' : 'lost') : 'open',
    amountIn: cost.toString(),
    amountOut: shares.toString(),
    settlement: refunds ? 'auto_cancelled' : winner ? 'resolved' : 'unresolved',
    claimAction: refunds ? 'refund' : won ? 'redeem' : null,
    claimAmount: refunds ? cost.toString() : won ? winningPayout(m, cost).toString() : null,
    priceYes: m.price_yes_bps / 10_000,
    volumePxpEquivalent: Number(cost) / 10 ** USDC_DECIMALS,
    yesReserveAfter: m.yes_shares,
    noReserveAfter: m.no_shares,
    traderAddress: '',
    createdAt: iso(m.created_at_sec),
    market: toPammMarket(m),
  };
}

/** One row for each side of a position the account still holds. */
export function positionRows(m: NearMarket, p: NearPosition): PammMarketTrade[] {
  const rows: PammMarketTrade[] = [];
  if (BigInt(p.yes_cost) > 0n) rows.push(tradeRow(m, 'yes', BigInt(p.yes_shares), BigInt(p.yes_cost)));
  if (BigInt(p.no_cost) > 0n) rows.push(tradeRow(m, 'no', BigInt(p.no_shares), BigInt(p.no_cost)));
  return rows;
}
