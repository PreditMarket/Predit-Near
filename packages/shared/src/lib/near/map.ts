import type { PoolStateResult } from '@/hooks/pamm/use-pool-state';
import type {
  PammMarket,
  PammMarketStatus,
  PammMarketTrade,
} from '@/services/pamm-market.service';
import { USDC_DECIMALS } from './config';
import type { NearClaim, NearMarket, NearOutcome, NearPosition, NearPost, NearSide } from './types';

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

/** Whether the contract still takes positions on this market right now. */
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
  return {
    id: m.id,
    question: m.rules.question,
    description: m.rules.description,
    thumbnail: m.rules.image_url ? { path: m.rules.image_url } : null,
    tweetUrl: m.post.source === 'x' ? `https://x.com/i/status/${m.post.post_id}` : null,
    yesLabel: m.rules.yes_label,
    noLabel: m.rules.no_label,
    status: statusOf(m),
    resolution: winnerOf(m),
    latestPriceYes: m.price_yes_bps / 10_000,
    createdAt: created,
    updatedAt: m.receipt ? iso(m.receipt.posted_at_sec) : created,
    rules: {
      outcomeRules: [
        { rule: m.rules.yes_condition, outcomeIndex: 0 },
        { rule: m.rules.no_condition, outcomeIndex: 1 },
      ],
    },
    totalVolumeUsdc: Number(m.volume) / 10 ** USDC_DECIMALS,
  };
}

/** A contract market in the shape the trade panel reads. */
export function toPoolState(m: NearMarket): PoolStateResult {
  const winner = winnerOf(m);
  return {
    creator: m.creator,
    createdTs: Number(m.created_at_sec),
    expiryTs: Number(m.rules.expiry_sec),
    resolutionCode: winner === 'yes' ? 1 : winner === 'no' ? 2 : 0,
    cancelled: m.status === 'cancelled' || (m.status === 'finalized' && !winner),
    creatorShareBps: m.creator_share_bps,
    priceYes: m.price_yes_bps / 10_000,
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
      resolvedPoolCollateral: BigInt(m.resolved_pool_collateral),
      resolvedXWin: BigInt(m.resolved_x_win),
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
    marketId: m.id,
    side: side === 'yes' ? 'buy_yes' : 'buy_no',
    status: winner ? (won ? 'won' : 'lost') : 'open',
    amountIn: cost.toString(),
    amountOut: shares.toString(),
    settlement: refunds ? 'auto_cancelled' : winner ? 'resolved' : 'unresolved',
    claimAction: refunds ? 'refund' : won ? 'redeem' : null,
    claimAmount: refunds ? cost.toString() : won ? winningPayout(m, cost).toString() : null,
    priceYes: m.price_yes_bps / 10_000,
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

/**
 * Sides the account was already paid for: the contract empties them, so they
 * come back from its claim record. A redeemed winning side reads as claimed
 * (and right), a losing side cleared with it as lost, a refund as claimed.
 */
export function claimRows(m: NearMarket, held: NearPosition, claim: NearClaim): PammMarketTrade[] {
  const winner = winnerOf(m);
  const rows: PammMarketTrade[] = [];
  for (const side of ['yes', 'no'] as const) {
    const cost = BigInt(side === 'yes' ? claim.position.yes_cost : claim.position.no_cost);
    const stillHeld = BigInt(side === 'yes' ? held.yes_cost : held.no_cost) > 0n;
    if (cost === 0n || stillHeld) continue;
    const shares = BigInt(side === 'yes' ? claim.position.yes_shares : claim.position.no_shares);
    const row = tradeRow(m, side, shares, cost);
    const paid = claim.kind === 'refund' || side === winner;
    rows.push({
      ...row,
      status: paid ? 'claimed' : 'lost',
      // A paid refund is history, not a cancelled position to act on.
      settlement: 'resolved',
      claimAction: null,
      claimAmount: paid ? (claim.kind === 'refund' ? cost.toString() : claim.payout) : null,
      claimKind: paid ? claim.kind : undefined,
      createdAt: iso(claim.at_sec),
    });
  }
  return rows;
}
