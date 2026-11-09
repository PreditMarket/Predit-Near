'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Plus } from 'lucide-react';
import { QuickTradeDialog } from '@/components/pamm/quick-trade-dialog';
import { usePortfolioRedeem } from '@/hooks/pamm/use-portfolio-redeem';
import { useV3Refund } from '@/hooks/pamm/use-v3-refund';
import { useWalletGate } from '@/hooks/use-wallet-gate';
import { getNearPosition } from '@/lib/near/contract';
import { isTradable, outcomeLabel, phaseLabel, safeHttpUrl, toPammMarket, winnerOf } from '@/lib/near/map';
import type { NearMarket, NearPosition, NearSide } from '@/lib/near/types';
import { useNearWallet } from '@/store/near-wallet.store';

const MAX_SHOWN = 5;
const SIDE_BUTTON =
  'flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 font-mono text-[12px] font-bold transition-colors';
const CLAIM_BUTTON =
  'inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1 font-mono text-[11px] font-bold text-primary-foreground disabled:opacity-50';

function RedeemButton({ marketId }: { marketId: string }) {
  const redeem = usePortfolioRedeem(marketId, marketId);
  return (
    <button type="button" className={CLAIM_BUTTON} disabled={redeem.isPending} onClick={() => redeem.mutate('0')}>
      {redeem.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
      Redeem
    </button>
  );
}

function RefundButton({ marketId }: { marketId: string }) {
  const refund = useV3Refund(marketId);
  return (
    <button type="button" className={CLAIM_BUTTON} disabled={refund.isPending} onClick={() => refund.mutate()}>
      {refund.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
      Refund
    </button>
  );
}

function ClaimAction({ market }: { market: NearMarket }) {
  const accountId = useNearWallet((s) => s.accountId);
  const { data: position } = useQuery({
    queryKey: ['near', 'position', market.id, accountId],
    queryFn: () => getNearPosition(market.id, accountId as string),
    enabled: !!accountId,
  });
  if (!position) return null;

  const winner = winnerOf(market);
  const shares = (p: NearPosition, side: NearSide) => BigInt(side === 'yes' ? p.yes_shares : p.no_shares);
  if (winner) return shares(position, winner) > BigInt(0) ? <RedeemButton marketId={market.id} /> : null;
  return BigInt(position.yes_cost) + BigInt(position.no_cost) > BigInt(0) ? (
    <RefundButton marketId={market.id} />
  ) : null;
}

function SettledResult({ market }: { market: NearMarket }) {
  const winner = winnerOf(market);
  const evidence = market.receipt ? safeHttpUrl(market.receipt.evidence.uri) : null;
  return (
    <div className="mt-2 flex flex-col gap-1.5" data-testid="post-market-resolved">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider ${
            winner ? 'border-success/30 bg-success/10 text-success' : 'border-border bg-muted text-muted-foreground'
          }`}
        >
          {phaseLabel(market)}
        </span>
        <span className="ml-auto">
          <ClaimAction market={market} />
        </span>
      </div>
      {market.receipt && (
        <p className="text-[12px] text-muted-foreground">
          {market.receipt.reason}
          {evidence && (
            <>
              {' · '}
              <a href={evidence} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                Evidence
              </a>
            </>
          )}
          {' · '}
          <Link href={`/market/${market.id}#receipt`} className="text-primary hover:underline">
            Receipt
          </Link>
        </p>
      )}
    </div>
  );
}

function PendingResult({ market }: { market: NearMarket }) {
  const text = market.receipt
    ? market.status === 'challenged'
      ? `Result ${outcomeLabel(market, market.receipt.outcome)} is being challenged`
      : `Proposed ${outcomeLabel(market, market.receipt.outcome)}, open to challenge`
    : 'Trading closed, waiting for the result';
  return <p className="mt-2 font-mono text-[11px] text-warning">{text}</p>;
}

function PostMarket({ market }: { market: NearMarket }) {
  const [side, setSide] = useState<NearSide | null>(null);
  const yesPct = market.price_yes_bps / 100;
  const settled = market.status === 'finalized' || market.status === 'cancelled';

  return (
    <div className="rounded-lg border border-border bg-background/40 px-3 py-2.5" data-testid="post-market">
      <Link
        prefetch={false}
        href={`/market/${market.id}`}
        className="text-[13px] font-semibold text-foreground hover:underline"
      >
        {market.rules.question}
      </Link>
      {isTradable(market) ? (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            data-testid="post-predict-yes"
            onClick={() => setSide('yes')}
            className={`${SIDE_BUTTON} border-success/30 bg-success/10 text-success hover:bg-success/20`}
          >
            <span className="truncate">{market.rules.yes_label}</span>
            <span>{yesPct.toFixed(0)}%</span>
          </button>
          <button
            type="button"
            data-testid="post-predict-no"
            onClick={() => setSide('no')}
            className={`${SIDE_BUTTON} border-danger/30 bg-danger/10 text-danger hover:bg-danger/20`}
          >
            <span className="truncate">{market.rules.no_label}</span>
            <span>{(100 - yesPct).toFixed(0)}%</span>
          </button>
        </div>
      ) : settled ? (
        <SettledResult market={market} />
      ) : (
        <PendingResult market={market} />
      )}
      {side && (
        <QuickTradeDialog
          market={toPammMarket(market)}
          open
          initialSide={side}
          onOpenChange={(open) => !open && setSide(null)}
        />
      )}
    </div>
  );
}

/** Creating needs a wallet, so a signed-out visitor connects one first. */
function CreateMarketButton({ postId }: { postId: string }) {
  const router = useRouter();
  const gate = useWalletGate();
  return (
    <div className="mt-2">
      <button
        type="button"
        data-testid="post-create-market"
        disabled={gate.connecting}
        onClick={gate.handleAction(() => router.push(`/market/create?post=${encodeURIComponent(postId)}`))}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 font-mono text-[11.5px] font-semibold text-foreground hover:bg-muted disabled:opacity-50"
      >
        <Plus className="h-3.5 w-3.5" />
        Create market
      </button>
    </div>
  );
}

/** Under a post: the markets created from it, or a way to create the first. */
export function PredictionBar({ postId, markets }: { postId: string; markets?: NearMarket[] }) {
  if (!markets) return <div className="mt-2 h-9 animate-pulse rounded-lg bg-muted/40" aria-hidden />;

  if (markets.length === 0) return <CreateMarketButton postId={postId} />;

  const byVolume = [...markets].sort((a, b) => Number(BigInt(b.volume) - BigInt(a.volume)));
  return (
    <div className="mt-2 flex flex-col gap-2" data-testid="prediction-bar">
      {byVolume.slice(0, MAX_SHOWN).map((market) => (
        <PostMarket key={market.id} market={market} />
      ))}
    </div>
  );
}
