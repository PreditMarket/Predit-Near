
import { formatCountdown } from '@/lib/pamm/v3-rules';

import type { WarningCandidate } from './pick-top-warning';

interface BuildWarningsArgs {
  mode: 'buy' | 'sell';
  isPaused: boolean;
  cancelled: boolean;
  /** Past expiry, waiting for a result: both buy and sell are halted. */
  resolving: boolean;
  frozen: boolean;
  freezeSoon: boolean;
  secondsUntilFreeze: number;
  tradeFreezeSeconds: number | undefined;
  isExpired: boolean;
  unquotable: boolean;
  insufficient: boolean;
  impactWarn: boolean;
  impactDanger: boolean;
  impact: number;
  hasQuote: boolean;

  // Labels used inline in banner copy.
  sideLabel: string;
  collateralSymbol: string;
}

/**
 * Every guard message the trader could see. `pickTopWarning` narrows this to
 * one banner (highest severity) rendered above the CTA. Kept declarative so a
 * reviewer can audit the full list in one place.
 */
export function buildWarnings(a: BuildWarningsArgs): WarningCandidate[] {
  const freezeStr = a.tradeFreezeSeconds
    ? formatCountdown(a.tradeFreezeSeconds)
    : '';

  return [
    {
      key: 'paused',
      when: a.isPaused,
      severity: 'danger',
      content: 'Trading is temporarily paused.',
    },
    {
      key: 'resolving',
      when: a.resolving,
      severity: 'danger',
      content:
        'Trading is closed while this market waits for its result. Nothing is settled yet, so there is nothing to claim.',
    },
    {
      key: 'cancelled',
      when: a.cancelled,
      severity: 'danger',
      content:
        'This market was cancelled — claim your refund instead of selling.',
    },
    {
      key: 'frozen',
      when: a.frozen,
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
      key: 'expired',
      when: a.isExpired,
      severity: 'warning',
      content: 'This market has closed — awaiting resolution.',
    },
    {
      key: 'unquotable',
      when: a.unquotable,
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
      content: (
        <>
          Insufficient {a.mode === 'buy' ? a.collateralSymbol : a.sideLabel} —
          try a smaller amount.
        </>
      ),
    },
    {
      key: 'impact-danger',
      when: !a.insufficient && a.hasQuote && a.impactDanger,
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
      when: !a.insufficient && a.hasQuote && a.impactWarn && !a.impactDanger,
      severity: 'warning',
      content: (
        <>
          This trade moves the price about {(a.impact * 100).toFixed(1)}%. A
          smaller size gets you a better rate.
        </>
      ),
    },
    {
      key: 'freeze-soon',
      when: a.freezeSoon,
      severity: 'info',
      content: (
        <>
          Trading closes in {formatCountdown(a.secondsUntilFreeze)} — the
          final {freezeStr} before this market settles are frozen.
        </>
      ),
    },
  ];
}
