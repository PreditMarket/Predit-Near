'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { XLogo, xProfileUrl } from '@/components/shared/x-logo';
import { getAllNearMarkets, getNearRecord } from '@/lib/near/contract';
import { phaseLabel, winnerOf } from '@/lib/near/map';
import type { NearMarket } from '@/lib/near/types';

function verdictOf(market: NearMarket): 'correct' | 'wrong' | null {
  const winner = winnerOf(market);
  if (!winner) return null;
  return winner === market.claim_side ? 'correct' : 'wrong';
}

const VERDICT_STYLE = {
  correct: 'border-success/30 bg-success/10 text-success',
  wrong: 'border-danger/30 bg-danger/10 text-danger',
};

function Stat({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border bg-card px-4 py-3">
      <span data-testid={testId} className="font-mono text-[20px] font-bold">{value}</span>
      <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
  );
}

function MarketRow({ market }: { market: NearMarket }) {
  const verdict = verdictOf(market);
  const side = market.claim_side === 'yes' ? market.rules.yes_label : market.rules.no_label;
  return (
    <li data-testid="record-market" className="flex flex-col gap-1.5 rounded-lg border border-border bg-card px-4 py-3">
      <Link prefetch={false} href={`/market/${market.id}`} className="text-[13px] font-semibold hover:underline">
        {market.rules.question}
      </Link>
      <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-muted-foreground">
        <span>Said: {side}</span>
        <span>· {phaseLabel(market)}</span>
        {verdict && (
          <span data-testid="record-verdict" className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider ${VERDICT_STYLE[verdict]}`}>
            {verdict}
          </span>
        )}
      </div>
    </li>
  );
}

/** What an author predicted, and how it turned out. The tally comes from the contract. */
export function AuthorRecord({ handle }: { handle: string }) {
  const authorRef = `x:${handle}`;
  const { data: record } = useQuery({
    queryKey: ['near', 'record', authorRef],
    queryFn: () => getNearRecord(authorRef),
  });
  const { data: markets, isLoading } = useQuery({
    queryKey: ['near', 'author-markets', authorRef],
    queryFn: async () => (await getAllNearMarkets()).filter((m) => m.post.author_ref === authorRef).reverse(),
  });
  const judged = record ? record.correct + record.wrong : 0;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 sm:px-6">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-[18px] font-bold">@{handle}</h1>
        <a href={xProfileUrl(handle)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
          View on <XLogo className="h-3 w-3" />
        </a>
      </header>
      <div className="grid grid-cols-3 gap-3">
        <Stat testId="record-correct" label="Correct" value={record ? String(record.correct) : '–'} />
        <Stat testId="record-wrong" label="Wrong" value={record ? String(record.wrong) : '–'} />
        <Stat testId="record-rate" label="Hit rate" value={judged ? `${Math.round((record!.correct / judged) * 100)}%` : '–'} />
      </div>
      <p className="text-[12px] text-muted-foreground">
        Counted on NEAR once a market settles. Whoever creates a market says which side the author took, so read the post before trusting a record.
      </p>
      {isLoading && <div className="h-24 animate-pulse rounded-lg bg-muted/40" aria-hidden />}
      {markets?.length === 0 && <p className="text-[13px] text-muted-foreground">No markets from this author&apos;s posts yet.</p>}
      <ul className="flex flex-col gap-2">
        {markets?.map((market) => (
          <MarketRow key={market.id} market={market} />
        ))}
      </ul>
    </main>
  );
}
