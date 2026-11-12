import { useMemo } from 'react';
import { formatQty, formatUsd } from '@/lib/format';
import type { PammMarketTrade } from '@/services/pamm-market.service';
import type { UnifiedPosition } from '@/services/unified-market.service';

function statusStyle(status: string): string {
  const s = status?.toLowerCase();
  if (s === 'won') return 'bg-primary/12 text-primary';
  if (s === 'lost') return 'bg-(--brand-danger-soft) text-danger';
  if (s === 'claimed') return 'bg-(--brand-success-soft) text-success';
  if (s === 'cancelled') return 'bg-warning/12 text-warning';
  return 'bg-muted/40 text-muted-foreground';
}

/** A settled prediction was right or wrong, not won or lost. */
function statusLabel(status: string): string {
  const s = status?.toLowerCase();
  if (s === 'won') return 'Right';
  if (s === 'lost') return 'Wrong';
  return status;
}

const DOLLAR_PEGGED = new Set(['', 'USDC', 'USDT', 'USD']);

/** An amount in the position's collateral: `$12.00`, `3.50 TUSDC`. */
export function formatAmount(amount: number | string | null | undefined, unit?: string): string {
  const s = (unit ?? '').trim().toUpperCase();
  if (DOLLAR_PEGGED.has(s)) return formatUsd(amount);
  return `${formatQty(amount, { dp: 2 })} ${s}`;
}

/** What the "Payout if right" column says, by how far along the position is. */
export type PositionPayout =
  | { kind: 'claim'; trade: PammMarketTrade; amount: number | null }
  | { kind: 'refund'; trade: PammMarketTrade; amount: number | null }
  | { kind: 'lost' }
  | { kind: 'claimed'; amount: number | null }
  | { kind: 'at-resolution' };

export interface PositionView {
  position: UnifiedPosition;
  statusClass: string;
  statusLabel: string;
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
}

/**
 * Everything a position row or card shows, worked out once — the desktop row
 * and the phone card render the same view.
 */
export function derivePositionView(position: UnifiedPosition): PositionView {
  const { side, status, entryPrice, currentPrice, sourceData, unit } = position;
  const s = status?.toLowerCase();

  const isNo = side === 'no';
  const sided = (p: number) => Math.round((isNo ? 1 - p : p) * 100);
  const entryPct = entryPrice != null ? sided(entryPrice) : null;
  const nowPct =
    s === 'won' || s === 'claimed' ? 100 : s === 'lost' ? 0 : currentPrice != null ? sided(currentPrice) : null;

  // The market's own yes/no labels drive the side badge in every status.
  const market = sourceData.market;
  const sideLabel = ((side === 'yes' ? market.yesLabel : market.noLabel)?.trim() || side).toUpperCase();

  return {
    position,
    statusClass: statusStyle(status),
    statusLabel: statusLabel(status),
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
    payout: payoutOf(position),
  };
}

function payoutOf({ status, payoutAmount, sourceData: trade }: UnifiedPosition): PositionPayout {
  const amount = payoutAmount ?? null;
  if (status === 'won') return { kind: 'claim', trade, amount };
  if (status === 'lost') return { kind: 'lost' };
  if (status === 'claimed') return { kind: 'claimed', amount };
  // Cancelled, invalid or one-sided: both sides are refunded at cost.
  if (status === 'cancelled') return { kind: 'refund', trade, amount };
  // The payout follows what the losing side staked, known only once settled.
  return { kind: 'at-resolution' };
}

/** Views for a list of positions, recomputed only when the list changes. */
export function usePositionViews(positions: UnifiedPosition[]): PositionView[] {
  return useMemo(() => positions.map(derivePositionView), [positions]);
}
