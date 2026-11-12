'use client';

import { Loader2 } from 'lucide-react';
import { usePortfolioRedeem } from '@/hooks/pamm/use-portfolio-redeem';
import { useV3Refund } from '@/hooks/pamm/use-v3-refund';

/**
 * One `redeem` claims the whole winning position, so every row of that market
 * shows this button but only the first click pays; hence "Claim all".
 */
export function PammRedeemButton({ poolAddress }: { poolAddress: string }) {
  const redeem = usePortfolioRedeem(poolAddress);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        redeem.mutate();
      }}
      disabled={redeem.isPending}
      className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-(--brand-success-soft) border border-(--brand-success-border) text-success text-[9px] font-mono font-bold uppercase hover:bg-(--brand-success-border) transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {redeem.isPending ? (
        <>
          <Loader2 className="w-2.5 h-2.5 animate-spin" /> Claiming…
        </>
      ) : (
        'Claim all'
      )}
    </button>
  );
}

/**
 * A market with no winner pays everyone their cost back through `refund`,
 * which also settles the whole position in one call, like PammRedeemButton.
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
