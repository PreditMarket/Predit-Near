'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { MarketCreatedCard } from '@/components/market/create/market-created-card';
import { QuickTradeDialog } from '@/components/pamm/quick-trade-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { getNearMarket, getNearMarketsForPosts } from '@/lib/near/contract';
import { toPammMarket } from '@/lib/near/map';
import type { NearMarket } from '@/lib/near/types';
import type { PostDto } from '@/services/feed.service';
import { useCreateMarketDialog } from '@/store/create-market-dialog.store';
import { useNearWallet } from '@/store/near-wallet.store';
import { CreateMarketForm, fetchPost } from './create-market-form';

const MAX_MARKETS_PER_POST = 5;
const READ_TRIES = 15;

/** A market just created: the RPC node may not have it for a moment. */
async function readNewMarket(id: string): Promise<NearMarket | null> {
  for (let tries = 0; tries < READ_TRIES; tries += 1) {
    const market = await getNearMarket(id).catch(() => null);
    if (market) return market;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  return null;
}
const PICKER_POSTS = 30;

interface Pickable {
  post: PostDto;
  markets: number;
  claim: string | null;
}

/** Recent feed posts that can still take a market, the ones NEAR AI reads as predictions first. */
async function fetchPickable(): Promise<Pickable[]> {
  const res = await fetch(`/api/feed?limit=${PICKER_POSTS}`);
  if (!res.ok) throw new Error('Could not load the feed');
  const posts = ((await res.json()) as { items: PostDto[] }).items;
  const ids = posts.map((p) => p.id);
  const [markets, detected] = await Promise.all([
    getNearMarketsForPosts(ids),
    fetch(`/api/detect?ids=${encodeURIComponent(ids.join(','))}`)
      .then(async (r) => (r.ok ? ((await r.json()) as { detected: Record<string, string> }).detected : {}))
      .catch((): Record<string, string> => ({})),
  ]);
  return posts
    .map((post) => ({ post, markets: markets.get(post.id)?.length ?? 0, claim: detected[post.id] ?? null }))
    .filter((p) => p.markets < MAX_MARKETS_PER_POST)
    .sort((a, b) => Number(!!b.claim) - Number(!!a.claim));
}

function PostPicker({ onPick }: { onPick: (postId: string) => void }) {
  const { data, isLoading, isError } = useQuery({ queryKey: ['create-picker'], queryFn: fetchPickable, staleTime: 60_000 });
  if (isLoading) return <div className="h-48 animate-pulse rounded-lg bg-muted/40" aria-hidden />;
  if (isError || !data) return <p className="py-8 text-center text-[13px] text-muted-foreground">Could not load the feed.</p>;
  return (
    <div className="flex flex-col gap-2" data-testid="create-picker">
      <p className="text-[12.5px] text-muted-foreground">Markets are created from a post. Pick one:</p>
      {data.map(({ post, markets, claim }) => (
        <button
          key={post.id}
          type="button"
          data-testid="create-pick"
          data-post={post.id}
          onClick={() => onPick(post.id)}
          className="flex flex-col gap-1 rounded-lg border border-border bg-card px-3 py-2 text-left hover:border-primary/60"
        >
          <span className="flex flex-wrap items-center gap-2 font-mono text-[10.5px] text-muted-foreground">
            @{post.author.handle}
            {claim && (
              <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-bold text-primary">
                <Sparkles className="h-2.5 w-2.5" />
                Prediction detected
              </span>
            )}
            {markets > 0 && <span>{markets} market{markets > 1 ? 's' : ''} already</span>}
          </span>
          <span className="line-clamp-2 text-[13px] text-foreground">{post.content}</span>
        </button>
      ))}
    </div>
  );
}

function PostForm({ postId, onCreated }: { postId: string; onCreated: (market: { id: string; question: string }) => void }) {
  const { data: post, isLoading, isError } = useQuery({
    queryKey: ['feed-post', postId],
    queryFn: () => fetchPost(postId),
    staleTime: Infinity,
  });
  if (isLoading) return <div className="h-48 animate-pulse rounded-lg bg-muted/40" aria-hidden />;
  if (isError || !post) return <p className="py-8 text-center text-[13px] text-muted-foreground">This post is no longer in the feed.</p>;
  return <CreateMarketForm post={post} onCreated={onCreated} />;
}

/** Creating a market without leaving the page: pick a post (or start from one), check the draft, sign once. */
export function CreateMarketDialog() {
  const open = useCreateMarketDialog((s) => s.open);
  const postId = useCreateMarketDialog((s) => s.postId);
  const openFor = useCreateMarketDialog((s) => s.openFor);
  const close = useCreateMarketDialog((s) => s.close);
  const accountId = useNearWallet((s) => s.accountId);
  const connect = useNearWallet((s) => s.connect);
  const [created, setCreated] = useState<{ id: string; question: string } | null>(null);
  const [trading, setTrading] = useState<NearMarket | null>(null);
  // Opened from the nav: the picker stays one click back.
  const [fromPicker, setFromPicker] = useState(false);

  const finish = () => {
    setCreated(null);
    setFromPicker(false);
    close();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !next && finish()}>
        <DialogContent
          data-testid="create-market-dialog"
          showCloseButton={!created}
          className={created ? 'max-w-md border-0 bg-transparent p-0 shadow-none' : 'max-h-[92vh] max-w-2xl overflow-y-auto'}
        >
          <DialogTitle className={created ? 'sr-only' : ''}>{created ? 'Market created' : 'Create a market'}</DialogTitle>
          <DialogDescription className="sr-only">Turn a post into a prediction market on NEAR.</DialogDescription>
          {created ? (
            <MarketCreatedCard
              itemLabel="Your Market"
              itemTitle={created.question}
              url={`/market/${created.id}`}
              onDismiss={finish}
              primaryAction={{
                label: 'Bet on it now',
                onClick: async () => {
                  const market = await readNewMarket(created.id);
                  finish();
                  if (market) setTrading(market);
                  else toast.error('The market is on chain but not readable yet. Open it from under its post.');
                },
              }}
              skipAction={{ label: 'Done', onClick: finish }}
            />
          ) : !accountId ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center text-[13px] text-muted-foreground">
              <p>Connect a NEAR wallet to create a market.</p>
              <Button onClick={() => void connect()}>Connect wallet</Button>
            </div>
          ) : postId ? (
            <div className="flex flex-col gap-3">
              {fromPicker && (
                <button
                  type="button"
                  onClick={() => openFor(null)}
                  className="inline-flex items-center gap-1 self-start text-[12px] text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Pick another post
                </button>
              )}
              <PostForm key={postId} postId={postId} onCreated={setCreated} />
            </div>
          ) : (
            <PostPicker
              onPick={(id) => {
                setFromPicker(true);
                openFor(id);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      {trading && (
        <QuickTradeDialog market={toPammMarket(trading)} open initialSide="yes" onOpenChange={(next) => !next && setTrading(null)} />
      )}
    </>
  );
}
