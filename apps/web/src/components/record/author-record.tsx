'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, CheckCircle2, Clock, Info, XCircle } from 'lucide-react';
import { XLogo, xProfileUrl } from '@/components/shared/x-logo';
import { getAllNearMarkets, getNearRecord } from '@/lib/near/contract';
import { phaseLabel, winnerOf } from '@/lib/near/map';
import type { NearMarket } from '@/lib/near/types';

type Verdict = 'right' | 'wrong' | 'pending' | 'unscored';

interface PostRecord {
  postId: string;
  text: string;
  /** The market whose result scored this post, as the contract counts it. */
  counted: NearMarket | null;
  verdict: Verdict;
  markets: NearMarket[];
}

const LABEL = 'font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground';

const VERDICT: Record<Verdict, { label: string; tone: string }> = {
  right: { label: 'Right', tone: 'border-success/40 bg-success/10 text-success' },
  wrong: { label: 'Wrong', tone: 'border-danger/40 bg-danger/10 text-danger' },
  pending: { label: 'Waiting for a result', tone: 'border-border bg-muted/30 text-muted-foreground' },
  unscored: { label: 'Not scored', tone: 'border-border bg-muted/30 text-muted-foreground' },
};

const sideLabel = (m: NearMarket) => (m.claim_side === 'yes' ? m.rules.yes_label : m.rules.no_label);

/**
 * Mirrors the contract: a post scores once, on the first of its markets to
 * settle with a winner (both sides held). Refunds and invalid results don't.
 */
function byPost(markets: NearMarket[]): PostRecord[] {
  const groups = new Map<string, NearMarket[]>();
  for (const m of markets) groups.set(m.post.post_id, [...(groups.get(m.post.post_id) ?? []), m]);
  return [...groups.entries()]
    .map(([postId, list]) => {
      const sorted = [...list].sort((a, b) => Number(b.id) - Number(a.id));
      const counted =
        [...list].filter((m) => winnerOf(m)).sort((a, b) => Number(a.resolved_ts) - Number(b.resolved_ts) || Number(a.id) - Number(b.id))[0] ??
        null;
      const verdict: Verdict = counted
        ? winnerOf(counted) === counted.claim_side
          ? 'right'
          : 'wrong'
        : list.some((m) => m.status !== 'finalized' && m.status !== 'cancelled')
          ? 'pending'
          : 'unscored';
      return { postId, text: list[0].post.text, counted, verdict, markets: sorted };
    })
    .sort((a, b) => Number(b.markets[0].id) - Number(a.markets[0].id));
}

function ScoreCard({ correct, wrong, pending }: { correct: number | null; wrong: number | null; pending: number }) {
  const judged = (correct ?? 0) + (wrong ?? 0);
  const rate = judged ? Math.round(((correct ?? 0) / judged) * 100) : null;
  return (
    <section className="grid gap-4 rounded-2xl border border-border/70 bg-card/60 p-5 sm:grid-cols-[auto_1fr] sm:items-center">
      <div className="flex flex-col">
        <span className={LABEL}>Hit rate</span>
        <span
          data-testid="record-rate"
          className={`font-mono text-[44px] font-extrabold leading-none tabular-nums ${
            rate === null ? 'text-muted-foreground' : rate >= 50 ? 'text-success' : 'text-danger'
          }`}
        >
          {rate === null ? '–' : `${rate}%`}
        </span>
      </div>
      <div className="flex flex-col gap-2.5">
        <div className="flex h-2 overflow-hidden rounded-full bg-muted/50">
          {judged > 0 && (
            <>
              <span className="h-full bg-success/80" style={{ width: `${((correct ?? 0) / judged) * 100}%` }} />
              <span className="h-full bg-danger/70" style={{ width: `${((wrong ?? 0) / judged) * 100}%` }} />
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <strong data-testid="record-correct" className="font-mono tabular-nums">
              {correct ?? '–'}
            </strong>
            right
          </span>
          <span className="inline-flex items-center gap-1.5">
            <XCircle className="h-4 w-4 text-danger" />
            <strong data-testid="record-wrong" className="font-mono tabular-nums">
              {wrong ?? '–'}
            </strong>
            wrong
          </span>
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-4 w-4" />
            <strong className="font-mono tabular-nums text-foreground">{pending}</strong>
            waiting for a result
          </span>
        </div>
      </div>
    </section>
  );
}

function HowItCounts() {
  const points = [
    'Each post that becomes a market is one claim by its author.',
    'It scores once, when the first of its markets with people on both sides settles.',
    "The market's creator says which side the author took, so read the post.",
  ];
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-border/70 px-4 py-3">
      <span className={`${LABEL} inline-flex items-center gap-1.5`}>
        <Info className="h-3.5 w-3.5" />
        How it is counted, on NEAR
      </span>
      <ul className="grid gap-1.5 text-[12.5px] leading-snug text-muted-foreground sm:grid-cols-3">
        {points.map((p, i) => (
          <li key={p} className="flex gap-2">
            <span className="font-mono text-[11px] font-bold text-primary">{i + 1}</span>
            {p}
          </li>
        ))}
      </ul>
    </section>
  );
}

function PostCard({ post, handle }: { post: PostRecord; handle: string }) {
  const verdict = VERDICT[post.verdict];
  const said = post.counted ?? post.markets[0];
  return (
    <article data-testid="record-post" data-post={post.postId} className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/60 p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <span className={LABEL}>@{handle} posted</span>
          <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-foreground">{post.text}</p>
        </div>
        <span
          data-testid={post.verdict === 'right' || post.verdict === 'wrong' ? 'record-verdict' : undefined}
          className={`shrink-0 rounded-lg border px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-wider ${verdict.tone}`}
        >
          {verdict.label}
        </span>
      </div>
      <p className="text-[12px] text-muted-foreground">
        Taken as saying <strong className="text-foreground">{sideLabel(said)}</strong>
        {post.counted && (
          <>
            {' '}
            · {phaseLabel(post.counted)}
          </>
        )}
      </p>
      <ul className="flex flex-col divide-y divide-border/50 rounded-xl border border-border/60">
        {post.markets.map((m) => {
          const isCounted = post.counted?.id === m.id;
          return (
            <li key={m.id} data-testid="record-market" data-market={m.id}>
              <Link
                prefetch={false}
                href={`/market/${m.id}`}
                className="group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-accent/30"
              >
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-1 text-[12.5px] font-medium text-foreground group-hover:text-primary">{m.rules.question}</span>
                  <span className="font-mono text-[10.5px] text-muted-foreground">{phaseLabel(m)}</span>
                </span>
                {isCounted ? (
                  <span className="shrink-0 rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-wider text-primary">
                    Counted
                  </span>
                ) : winnerOf(m) && post.counted ? (
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">one per post</span>
                ) : (
                  m.status === 'finalized' && <span className="shrink-0 font-mono text-[10px] text-muted-foreground">not scored</span>
                )}
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
              </Link>
            </li>
          );
        })}
      </ul>
    </article>
  );
}

/** How often an author's posts turned out right. The tally is the contract's. */
export function AuthorRecord({ handle }: { handle: string }) {
  const authorRef = `x:${handle}`;
  const { data: record } = useQuery({
    queryKey: ['near', 'record', authorRef],
    queryFn: () => getNearRecord(authorRef),
  });
  const { data: markets, isLoading } = useQuery({
    queryKey: ['near', 'author-markets', authorRef],
    queryFn: async () => (await getAllNearMarkets()).filter((m) => m.post.author_ref === authorRef),
  });
  const posts = useMemo(() => byPost(markets ?? []), [markets]);
  const pending = posts.filter((p) => p.verdict === 'pending').length;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 sm:px-6">
      <header className="flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-[#8b7bff]/80 font-mono text-[18px] font-extrabold uppercase text-background">
          {handle.slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[20px] font-bold">@{handle}</h1>
          <p className="text-[12.5px] text-muted-foreground">Prediction record · how often this account&apos;s posts turned out right</p>
        </div>
        <a
          href={xProfileUrl(handle)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border/70 px-2.5 py-1.5 text-[12px] text-muted-foreground hover:text-foreground"
        >
          View on <XLogo className="h-3 w-3" />
        </a>
      </header>

      <ScoreCard correct={record ? record.correct : null} wrong={record ? record.wrong : null} pending={pending} />
      <HowItCounts />

      {isLoading && <div className="h-40 animate-pulse rounded-2xl bg-muted/40" aria-hidden />}
      {markets && posts.length === 0 && (
        <p className="rounded-2xl border border-border/70 py-12 text-center text-[13px] text-muted-foreground">No markets from this author&apos;s posts yet.</p>
      )}
      {posts.length > 0 && (
        <section className="flex flex-col gap-3">
          <span className={LABEL}>
            {posts.length} post{posts.length > 1 ? 's' : ''} turned into markets
          </span>
          {posts.map((post) => (
            <PostCard key={post.postId} post={post} handle={handle} />
          ))}
        </section>
      )}
    </main>
  );
}
