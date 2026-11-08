
import { formatCountdown } from '@/lib/pamm/v3-rules';

import type { WarningCandidate } from './pick-top-warning';

export interface BuildWarningsArgs {
  mode: 'buy' | 'sell';
  isV3: boolean;
  isPaused: boolean;
  cancelled: boolean;
  /** Admin has flagged this market for review — buy is halted, sell allowed. */
  underReview: boolean;
  /** Market entered the AI resolve flow — both buy and sell are halted. */
  resolving: boolean;
  /** Trader petition paused trading pending an admin call — reversible. */
  tradingPaused: boolean;
  /** Admin has banned this wallet from trading (this market or all markets). */
  bannedFromTrading: boolean;
  v3Frozen: boolean;
  v3FreezeSoon: boolean;
  v3SecondsUntilFreeze: number;
  v3TradeFreezeSeconds: number | undefined;
  seeded: boolean;
  isExpired: boolean;
  v3Unquotable: boolean;
  insufficient: boolean;
  poolCannotBuy: boolean;
  exceedsMax: boolean;
  impactWarn: boolean;
  impactDanger: boolean;
  impact: number;
  hasQuote: boolean;

  // Labels / values used inline in banner copy.
  sideLabel: string;
  oppositeSideLabel: string;
  collateralSymbol: string;
  totalSpendDisplay: string;
  feeRawIsZero: boolean;
  maxTradeDisplay: string;
  maxUnit: string;

  // Actions used from action buttons inside banners.
  onApplyMaxTrade: () => void;
}

/**
 * Every guard message the trader could see. `pickTopWarning` narrows this to
 * one banner (highest severity) rendered above the CTA. Kept declarative so a
 * reviewer can audit the full list in one place.
 */
export function buildWarnings(a: BuildWarningsArgs): WarningCandidate[] {
  const freezeStr = a.v3TradeFreezeSeconds
    ? formatCountdown(a.v3TradeFreezeSeconds)
    : '';

  return [
    {
      key: 'paused',
      when: a.isPaused,
      severity: 'danger',
      content: 'Trading is temporarily paused.',
    },
    {
      key: 'trading-paused',
      when: a.tradingPaused && !a.resolving,
      severity: 'danger',
      content:
        'Trading is paused while an admin reviews an early-resolve request. It resumes if the request is rejected.',
    },
    {
      key: 'resolving',
      when: a.resolving,
      severity: 'danger',
      content:
        'Trading is paused — the AI is settling this market. Nothing is on-chain yet, so there is nothing to claim.',
    },
    {
      key: 'banned',
      when: a.bannedFromTrading,
      severity: 'danger',
      content:
        "You've been restricted from trading on this market. Contact support for details.",
    },
    {
      key: 'under-review',
      when: a.underReview,
      severity: 'danger',
      content:
        a.mode === 'buy'
          ? 'This market is under admin review. Buying is halted; you can still sell existing positions.'
          : 'This market is under admin review. Selling is still allowed.',
    },
    {
      key: 'cancelled-v3',
      when: a.cancelled && a.isV3,
      severity: 'danger',
      content:
        'This market was cancelled — claim your refund instead of selling.',
    },
    {
      key: 'cancelled-v12',
      when: a.cancelled && !a.isV3,
      severity: 'warning',
      content: `This market was cancelled — sell your ${a.sideLabel} / ${a.oppositeSideLabel} positions to reclaim ${a.collateralSymbol}.`,
    },
    {
      key: 'v3-frozen',
      when: a.v3Frozen,
      severity: 'danger',
      content: (
        <>
          <div>
            Trading is closed for the run-up to this market&apos;s close.
          </div>
          <div className="text-muted-foreground">
            The last {freezeStr} before a market settles are frozen so nobody
            can trade on the result as it lands.
          </div>
        </>
      ),
    },
    {
      key: 'not-seeded',
      when: !a.seeded,
      severity: 'info',
      content:
        'This market is getting set up — add liquidity to start trading.',
    },
    {
      key: 'expired',
      when: a.isExpired,
      severity: 'warning',
      content: 'This market has closed — awaiting resolution.',
    },
    {
      key: 'v3-unquotable',
      when: a.v3Unquotable,
      severity: 'warning',
      content:
        a.mode === 'sell'
          ? `That's more ${a.sideLabel} than this market has outstanding — try a smaller amount.`
          : "Can't price this amount — try a different size.",
    },
    {
      key: 'insufficient',
      when: a.insufficient,
      severity: 'warning',
      content:
        a.mode === 'buy' && !a.feeRawIsZero ? (
          <>
            Total spend{' '}
            <span className="font-semibold">
              ({a.totalSpendDisplay} {a.collateralSymbol})
            </span>{' '}
            exceeds your balance including the trading fee.
          </>
        ) : (
          <>
            Insufficient {a.mode === 'buy' ? a.collateralSymbol : a.sideLabel} —
            try a smaller amount.
          </>
        ),
    },
    {
      key: 'pool-cannot-buy',
      when: a.poolCannotBuy,
      severity: 'warning',
      content: (
        <>
          {a.sideLabel} is almost fully priced in — buying it here costs close
          to $1/share. Consider {a.oppositeSideLabel} instead.
        </>
      ),
    },
    {
      key: 'exceeds-max',
      when: a.exceedsMax,
      severity: 'warning',
      content:
        a.mode === 'buy'
          ? 'Large for this market — price may be less favorable.'
          : 'Large for this market — selling less keeps more value per share.',
      action: (
        <button
          onClick={a.onApplyMaxTrade}
          className="cursor-pointer underline-offset-2 hover:underline"
        >
          Use max: ~{a.maxTradeDisplay} {a.maxUnit}
        </button>
      ),
    },
    {
      key: 'impact-danger',
      when:
        !a.exceedsMax &&
        !a.poolCannotBuy &&
        !a.insufficient &&
        a.hasQuote &&
        a.impactDanger,
      severity: 'danger',
      content: (
        <>
          This trade moves the price about {(a.impact * 100).toFixed(1)}%. Your
          average price ends up quite a bit above the current one.
        </>
      ),
    },
    {
      key: 'impact-warn',
      when:
        !a.exceedsMax &&
        !a.poolCannotBuy &&
        !a.insufficient &&
        a.hasQuote &&
        a.impactWarn &&
        !a.impactDanger,
      severity: 'warning',
      content: (
        <>
          This trade moves the price about {(a.impact * 100).toFixed(1)}%. A
          smaller size gets you a better rate.
        </>
      ),
    },
    {
      key: 'v3-freeze-soon',
      when: a.v3FreezeSoon,
      severity: 'info',
      content: (
        <>
          Trading closes in {formatCountdown(a.v3SecondsUntilFreeze)} — the
          final {freezeStr} before this market settles are frozen.
        </>
      ),
    },
  ];
}
