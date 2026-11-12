import type { AdvanceRow, AdvanceStat } from './advance-panel';
import { cents, fmtTokenAmount, usd2 } from './formatters';
import type { BuyPreview, SellPreview } from './use-trade-preview';

export interface AdvanceData {
  stats: [AdvanceStat, AdvanceStat];
  meterLabel: string;
  meterValue: string;
  markerPct: number;
  markerLabel: string;
  impactText: string;
  rows: AdvanceRow[];
}

interface Args {
  mode: 'buy' | 'sell';
  buyPreview: BuyPreview | null;
  sellPreview: SellPreview | null;
  sideLabel: string;
  oppositeSideLabel: string;
  /** USD value the user typed (buy) — used for the max-loss tile. */
  amountUsd: number;
  /** Cost basis for the active side (0..1 price). */
  avgCost: number;
  /** Current market price of the active side (0..1). */
  activePrice: number;
  /** Redeem fee charged on a win, basis points. */
  redeemFeeBps: number;
}

const DASH = '—';

const fmtRedeemFee = (bps: number): string =>
  `${(bps / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;

/** Compose the numbers the AdvancePanel component needs from the raw quote
 * previews. Always returns a value — when the preview is null (no amount
 * typed yet, or the quote is in flight) we fall back to zero-state
 * placeholders so the panel can render at any time. Meter still shows the
 * current market price; profit tiles read "—". */
export function deriveAdvanceData(a: Args): AdvanceData {
  const currentCents = Math.round(a.activePrice * 100);

  if (a.mode === 'buy') {
    if (!a.buyPreview) {
      return {
        stats: [
          {
            label: 'Max profit',
            value: DASH,
            sub: `if ${a.sideLabel} resolves`,
            tone: 'win',
          },
          {
            label: 'Max loss',
            value: DASH,
            sub: `if ${a.oppositeSideLabel} resolves`,
            tone: 'lose',
          },
        ],
        meterLabel: 'Break-even',
        meterValue: `${currentCents}¢`,
        markerPct: currentCents,
        markerLabel: `${currentCents}¢`,
        impactText: '0.00% impact',
        rows: [
          { label: 'Avg fill', value: `${currentCents}¢` },
          { label: 'Min received', value: DASH },
          { label: 'Trade fee', value: DASH },
          { label: 'Redeem fee on win', value: fmtRedeemFee(a.redeemFeeBps) },
        ],
      };
    }
    const markerCents = Math.round(a.buyPreview.avgPx * 100);
    const impactSign = a.buyPreview.impactPct >= 0 ? '+' : '−';
    const impactStr = `${impactSign}${Math.abs(a.buyPreview.impactPct).toFixed(2)}%`;
    // Max profit — the payout depends on the opposite side's trades. If the
    // projected profit is not positive yet (no losers, or bonus < fee) show a
    // dash + hint instead of a misleading "+$-x.xx".
    const profit = a.buyPreview.potentialProfit;
    const hasProfit = profit > 0;
    // Max loss — exclude the trade fee. Fee is spent regardless of outcome, so
    // the "if opposite side resolves" scenario really only loses the net stake
    // that reached the curve. Fee stays visible in the "Trade fee" row.
    const netStake = Math.max(0, a.amountUsd - a.buyPreview.feeUsd);
    return {
      stats: [
        hasProfit
          ? {
              label: 'Max profit',
              value: `+${usd2(profit)}`,
              sub: `if ${a.sideLabel} resolves`,
              tone: 'win',
            }
          : {
              label: 'Max profit',
              value: DASH,
              sub: 'grows as opposite side trades',
              tone: 'win',
            },
        {
          label: 'Max loss',
          value: `−${usd2(netStake)}`,
          sub: `if ${a.oppositeSideLabel} resolves`,
          tone: 'lose',
        },
      ],
      meterLabel: 'Break-even',
      meterValue: `${markerCents}¢`,
      markerPct: markerCents,
      markerLabel: `${markerCents}¢`,
      impactText: `${impactStr} impact`,
      rows: [
        { label: 'Avg fill', value: `${markerCents}¢` },
        {
          label: 'Min received',
          value: `${fmtTokenAmount(a.buyPreview.minShares)} ${a.sideLabel}`,
        },
        { label: 'Trade fee', value: usd2(a.buyPreview.feeUsd) },
        { label: 'Redeem fee on win', value: fmtRedeemFee(a.redeemFeeBps) },
      ],
    };
  }

  // SELL — same zero-state shape.
  if (!a.sellPreview) {
    return {
      stats: [
        {
          label: 'You receive',
          value: DASH,
          sub: 'net USDC out',
          tone: 'win',
        },
        {
          label: 'Realized P&L',
          value: DASH,
          sub: 'vs. avg cost',
          tone: 'win',
        },
      ],
      meterLabel: 'Current price',
      meterValue: `${currentCents}¢`,
      markerPct: currentCents,
      markerLabel: `${currentCents}¢ now`,
      impactText: 'impact 0.00%',
      rows: [
        {
          label: 'Cost basis',
          value: a.avgCost > 0 ? cents(a.avgCost) : `${currentCents}¢`,
        },
        { label: 'Min received', value: DASH },
        { label: 'Trade fee', value: DASH },
        { label: 'Redeem fee on win', value: fmtRedeemFee(a.redeemFeeBps) },
      ],
    };
  }

  const markerCents = Math.round(a.sellPreview.avgPx * 100);
  const pnlSign = a.sellPreview.realizedPnl >= 0 ? '+' : '−';
  return {
    stats: [
      {
        label: 'You receive',
        value: `+${usd2(a.sellPreview.netUsd)}`,
        sub: 'net USDC out',
        tone: 'win',
      },
      {
        label: 'Realized P&L',
        value: `${pnlSign}${usd2(Math.abs(a.sellPreview.realizedPnl))}`,
        sub: 'vs. avg cost',
        tone: a.sellPreview.realizedPnl < 0 ? 'lose' : 'win',
      },
    ],
    meterLabel: 'Current price',
    meterValue: `${Math.round(a.activePrice * 100)}¢`,
    markerPct: markerCents,
    markerLabel: `${markerCents}¢ now`,
    impactText: `impact ${a.sellPreview.impactPct.toFixed(2)}%`,
    rows: [
      {
        label: 'Cost basis',
        value: a.avgCost > 0 ? cents(a.avgCost) : `${markerCents}¢`,
      },
      { label: 'Min received', value: `${usd2(a.sellPreview.minReceive)} USDC` },
      { label: 'Trade fee', value: usd2(a.sellPreview.feeUsd) },
      { label: 'Redeem fee on win', value: fmtRedeemFee(a.redeemFeeBps) },
    ],
  };
}
