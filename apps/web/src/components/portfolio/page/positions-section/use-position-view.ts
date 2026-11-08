import { useMemo } from 'react';
import { formatQty, formatUsd } from '@/lib/format';
import type { PammMarketTrade } from '@/services/pamm-market.service';
import type { MarketSource, UnifiedPosition } from '@/services/unified-market.service';

const SOURCE_STYLE: Record<MarketSource, string> = {
  predit: 'bg-brand-purple/15 text-brand-purple',
  polymarket: 'bg-brand-purple/15 text-brand-purple',
  kalshi: 'bg-primary/15 text-primary',
  pamm: 'bg-brand-purple/15 text-brand-purple',
  quick: 'bg-warning/15 text-warning',
};

const SOURCE_LABEL: Record<MarketSource, string> = {
  predit: 'PREDIT',
  polymarket: 'POLY',
  kalshi: 'KALSHI',
  pamm: 'PREDIT',
  quick: 'QUICK',
};

function statusStyle(status: string): string {
  const s = status?.toLowerCase();
  if (s === 'won') return 'bg-primary/12 text-primary';
  if (s === 'lost') return 'bg-(--brand-danger-soft) text-danger';
  if (s === 'claimed') return 'bg-(--brand-success-soft) text-success';
  if (s === 'cancelled') return 'bg-warning/12 text-warning';
  return 'bg-muted/40 text-muted-foreground';
}

const DOLLAR_PEGGED = new Set(['', 'USDC', 'USDT', 'USD']);

/** An amount in the position's collateral: `$12.00`, `1,000 XP`, `3.5 BONK`. */
export function formatAmount(amount: number | string | null | undefined, unit?: string): string {
  const s = (unit ?? '').trim().toUpperCase();
  if (s === 'PXP') return `${formatQty(amount, { dp: 0 })} XP`;
  if (DOLLAR_PEGGED.has(s)) return formatUsd(amount);
  return `${formatQty(amount, { dp: 2 })} ${s}`;
}

/** What the "To win" column says, by how far along the position is. */
export type PositionPayout =
  | { kind: 'claim'; trade: PammMarketTrade; amount: number | null }
  | { kind: 'refund'; trade: PammMarketTrade; amount: number | null }
  | { kind: 'reclaim' }
  | { kind: 'closed' }
  | { kind: 'lost' }
  | { kind: 'claimed' }
  | { kind: 'to-win'; amount: number }
  | { kind: 'at-resolution' }
  | { kind: 'none' };

export interface PositionView {
  position: UnifiedPosition;
  sourceLabel: string;
  sourceClass: string;
  statusClass: string;
  /** The market's own outcome label when it has one, upper-cased. */
  sideLabel: string;
  sideClass: string;
  /** Prices as the held side's odds, in whole percent; null when unknown. */
  entryPct: number | null;
  nowPct: number | null;
  /** Meaningless once a market is cancelled (no win or loss). */
  showPrices: boolean;
  traded: string;
  shares: string | null;
  payout: PositionPayout;
  xp: string | null;
}

/**
 * Everything a position row or card shows, worked out once — the desktop row
 * and the phone card render the same view.
 */
export function derivePositionView(position: UnifiedPosition): PositionView {
  const { source, side, status, entryPrice, currentPrice, sourceData, unit, marketVersion } =
    position;
  const s = status?.toLowerCase();

  // v3 pays out cost basis plus a pro-rata slice of the losing side, so there
  // is no per-position "to win" until the market resolves, and `shares` is a
  // share count, not a redeemable token amount.
  const isV3 = marketVersion === 'v3_shares';
  const isNo = side === 'no';
  const sided = (p: number) => Math.round((isNo ? 1 - p : p) * 100);
  const entryPct = entryPrice != null ? sided(entryPrice) : null;
  const nowPct =
    s === 'won' || s === 'claimed' ? 100 : s === 'lost' ? 0 : currentPrice != null ? sided(currentPrice) : null;

  const isPamm = source === 'pamm';
  // The PAMM trade row, for claiming (settled) or a refund (cancelled).
  const pammTrade =
    isPamm && ['won', 'lost', 'claimed', 'cancelled'].includes(status)
      ? (sourceData as PammMarketTrade)
      : null;
  // The market's own yes/no labels drive the side badge in every status.
  const pammMarket = isPamm ? (sourceData as PammMarketTrade)?.market : null;
  const sideLabel = (
    (side === 'yes' ? pammMarket?.yesLabel : pammMarket?.noLabel)?.trim() || side
  ).toUpperCase();

  return {
    position,
    sourceLabel: SOURCE_LABEL[source],
    sourceClass: SOURCE_STYLE[source],
    statusClass: statusStyle(status),
    sideLabel,
    sideClass:
      side === 'yes'
        ? 'bg-(--brand-success-soft) text-success'
        : 'bg-(--brand-danger-soft) text-danger',
    entryPct,
    nowPct,
    showPrices: s !== 'cancelled',
    traded: formatAmount(position.amount, unit ?? 'USDC'),
    shares: position.shares != null ? formatQty(position.shares, { dp: 2 }) : null,
    payout: payoutOf(position, pammTrade, isV3),
    xp: position.xpValue != null ? formatQty(position.xpValue, { dp: 0 }) : null,
  };
}

function payoutOf(
  { source, status, toWin, payoutAmount }: UnifiedPosition,
  pammTrade: PammMarketTrade | null,
  isV3: boolean,
): PositionPayout {
  if (pammTrade && status === 'won') return { kind: 'claim', trade: pammTrade, amount: payoutAmount ?? null };
  if (source === 'pamm' && status === 'closed') return { kind: 'closed' };
  if (pammTrade && status === 'lost') return { kind: 'lost' };
  if (pammTrade && status === 'claimed') return { kind: 'claimed' };
  // A cancelled v3 market pays back through refund_v3 (selling reverts once
  // cancelled), so claim inline. Covers the auto-cancelled one-sided market
  // too: the BE marks both sides `cancelled` off the pool's settlement mode.
  if (pammTrade && status === 'cancelled' && isV3) {
    return { kind: 'refund', trade: pammTrade, amount: payoutAmount ?? null };
  }
  // v1/v2: reclaim = sell back to the pool on the market page, which the row
  // links to — so this is a hint.
  if (source === 'pamm' && status === 'cancelled') return { kind: 'reclaim' };
  if (toWin != null) return { kind: 'to-win', amount: toWin };
  if (isV3 && status !== 'closed') return { kind: 'at-resolution' };
  return { kind: 'none' };
}

/** Views for a list of positions, recomputed only when the list changes. */
export function usePositionViews(positions: UnifiedPosition[]): PositionView[] {
  return useMemo(() => positions.map(derivePositionView), [positions]);
}
