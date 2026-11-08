'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { PammMarketVersion } from '@/services/pamm/market-be';
import { usePortfolioRedeem } from '@/hooks/pamm/use-portfolio-redeem';
import { useV3Refund } from '@/hooks/pamm/use-v3-refund';
import {
  formatCountdown,
  getClaimBaseTs,
  getClaimDelayRemaining,
} from '@/lib/pamm/claim-delay';

export function PammRedeemButton({
  poolAddress,
  tradeId,
  amountOut,
  marketVersion,
  expiryTs,
  resolvedAt,
  claimDelaySecs,
}: {
  poolAddress: string;
  tradeId: string;
  /** Ignored for v3 — `redeem_v3` takes no amount. */
  amountOut: string;
  marketVersion?: PammMarketVersion;
  expiryTs?: number | string | null;
  resolvedAt?: string | null;
  /** Pool's own claim delay. Undefined → the program's 24h fallback, which is
   *  the right answer for v1/v2 but only a guess for v3. */
  claimDelaySecs?: number | null;
}) {
  const redeem = usePortfolioRedeem(poolAddress, tradeId, marketVersion);
  // v3 claims the entire position in one instruction, so several trades on the
  // same market each render a Claim button but only the first does anything —
  // the rest revert with `NothingToRedeem` (which has friendly copy). Label it
  // so the user knows one click settles the whole market.
  const isV3 = marketVersion === 'v3_shares';

  // Claims unlock after the market settled — checked here from BE-provided
  // data (no on-chain fetch) so the button is disabled *before* the user can
  // trigger a claim tx that the program would reject anyway. Attempting the
  // tx while still locked used to surface a confusing raw
  // "Invalid account discriminator" error instead of a clear "come back
  // later" message. For markets resolved *early* the delay counts from the
  // resolution time (the program resets expiry), not the original expiryTs —
  // see getClaimBaseTs.
  const claimBaseTs =
    expiryTs != null || resolvedAt != null
      ? getClaimBaseTs(expiryTs, resolvedAt)
      : null;

  const [nowTs, setNowTs] = useState(() => Math.floor(Date.now() / 1000));
  const claimDelayRemaining =
    claimBaseTs != null
      ? getClaimDelayRemaining(claimBaseTs, nowTs, claimDelaySecs)
      : 0;
  const claimLocked = claimDelayRemaining > 0;

  // Tick every second so the countdown's seconds digit actually moves; stops
  // itself once the delay hits 0 (claimLocked flips false → effect re-runs
  // and returns early, no more re-renders from this button).
  useEffect(() => {
    if (!claimLocked) return;
    const id = window.setInterval(
      () => setNowTs(Math.floor(Date.now() / 1000)),
      1_000,
    );
    return () => window.clearInterval(id);
  }, [claimLocked]);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (claimLocked) return;
        redeem.mutate(amountOut);
      }}
      disabled={redeem.isPending || claimLocked}
      title={
        claimLocked
          ? `Claims unlock in ${formatCountdown(claimDelayRemaining)}`
          : undefined
      }
      className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-(--brand-success-soft) border border-(--brand-success-border) text-success text-[9px] font-mono font-bold uppercase hover:bg-(--brand-success-border) transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {redeem.isPending ? (
        <>
          <Loader2 className="w-2.5 h-2.5 animate-spin" /> Claiming…
        </>
      ) : claimLocked ? (
        `Unlocks in ${formatCountdown(claimDelayRemaining)}`
      ) : isV3 ? (
        'Claim all'
      ) : (
        'Claim'
      )}
    </button>
  );
}

/**
 * A cancelled V3 market pays everyone their cost basis back (no winner) via
 * `refund_v3`, not `redeem_v3` — same "one instruction settles the whole
 * position" caveat as PammRedeemButton: multiple rows on the same market each
 * render this button, but only the first click does anything; the rest fail
 * on-chain, same as the existing WON-claim behavior.
 */
export function PammClaimRefundButton({ poolAddress }: { poolAddress: string }) {
  const refund = useV3Refund(poolAddress);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        refund.mutate();
      }}
      disabled={refund.isPending}
      className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-warning/15 border border-warning/30 text-warning text-[9px] font-mono font-bold uppercase hover:bg-warning/25 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {refund.isPending ? (
        <>
          <Loader2 className="w-2.5 h-2.5 animate-spin" /> Claiming…
        </>
      ) : (
        'Claim refund'
      )}
    </button>
  );
}
