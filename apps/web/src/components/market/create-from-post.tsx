'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { MarketCreatedCard } from '@/components/market/create/market-created-card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { createMarketOnNear, CREATE_MARKET_MARGIN, getNearCreationBond } from '@/lib/near/contract';
import { getNearNativeBalance } from '@/lib/near/rpc';
import type { NearSide } from '@/lib/near/types';
import { getCategories } from '@/services/categories.service';
import type { PostDto } from '@/services/feed.service';
import { useNearWallet } from '@/store/near-wallet.store';

const MAX_SHORT = 200;
const MAX_LONG = 600;
const MAX_LABEL = 40;
const MIN_LEAD_MS = 10 * 60_000;
const DEFAULT_LEAD_MS = 7 * 24 * 3_600_000;

const INPUT =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none focus:border-primary';
const bytes = (text: string) => new TextEncoder().encode(text).length;

/** The longest start of `text` that fits the contract's byte limit. */
function fitBytes(text: string, max: number): string {
  let out = '';
  for (const char of text) {
    if (bytes(out + char) > max) break;
    out += char;
  }
  return out;
}

/** The value a datetime-local input expects, in the viewer's time zone. */
function localDateTime(ms: number): string {
  const date = new Date(ms);
  return new Date(ms - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="text-[11.5px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

function CenteredNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center text-[13px] text-muted-foreground">
      {children}
    </div>
  );
}

async function fetchPost(id: string): Promise<PostDto | null> {
  const res = await fetch(`/api/feed?id=${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Could not load the post');
  return ((await res.json()) as { post: PostDto }).post;
}

function CreateForm({ post }: { post: PostDto }) {
  const accountId = useNearWallet((s) => s.accountId) as string;
  const queryClient = useQueryClient();
  const firstImage = post.media?.find((m) => m.url.startsWith('https://'))?.url ?? '';

  const [form, setForm] = useState({
    question: fitBytes(post.content.replace(/\s+/g, ' ').trim(), MAX_SHORT),
    description: '',
    yesLabel: 'Yes',
    noLabel: 'No',
    yesCondition: '',
    noCondition: '',
    invalidConditions: 'The source named above cannot be read at the deadline.',
    source: '',
    deadline: localDateTime(Date.now() + DEFAULT_LEAD_MS),
    category: 'crypto',
    imageUrl: firstImage,
    claimSide: 'yes' as NearSide,
  });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const [phase, setPhase] = useState<'idle' | 'signing' | 'done'>('idle');
  const [created, setCreated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: categories = [] } = useQuery({ queryKey: ['categories-list'], queryFn: getCategories });
  const { data: bond } = useQuery({ queryKey: ['near', 'creation-bond'], queryFn: getNearCreationBond });
  const { data: balance } = useQuery({
    queryKey: ['near', 'balance', 'native', accountId],
    queryFn: () => getNearNativeBalance(accountId),
  });
  const needed = bond === undefined ? null : bond + CREATE_MARKET_MARGIN;
  const shortOfNear = needed !== null && balance !== undefined && (balance ?? BigInt(0)) < needed;

  const expiry = Math.floor(new Date(form.deadline).getTime() / 1000);
  const problem = useMemo(() => {
    if (!form.question.trim()) return 'Write the question.';
    if (bytes(form.question) > MAX_SHORT) return 'The question is too long.';
    if (!form.yesLabel.trim() || !form.noLabel.trim()) return 'Both outcomes need a label.';
    if (form.yesLabel.trim() === form.noLabel.trim()) return 'The two outcomes need different labels.';
    if (bytes(form.yesLabel) > MAX_LABEL || bytes(form.noLabel) > MAX_LABEL) return 'A label is too long.';
    if (!form.yesCondition.trim() || !form.noCondition.trim() || !form.invalidConditions.trim()) {
      return 'Fill in when the market resolves each way, and when it is invalid.';
    }
    if ([form.description, form.yesCondition, form.noCondition, form.invalidConditions].some((t) => bytes(t) > MAX_LONG)) {
      return 'One of the texts is too long.';
    }
    if (!/^https:\/\/\S+\.\S+/.test(form.source) || bytes(form.source) > MAX_SHORT) {
      return 'The source must be an https link that can settle the question.';
    }
    if (form.imageUrl && (!form.imageUrl.startsWith('https://') || bytes(form.imageUrl) > MAX_SHORT)) {
      return 'The image must be an https link.';
    }
    if (!Number.isFinite(expiry) || expiry * 1000 < Date.now() + MIN_LEAD_MS) {
      return 'The deadline must be at least 10 minutes away.';
    }
    return null;
  }, [form, expiry]);

  const submit = async () => {
    if (bond === undefined) return;
    setError(null);
    setPhase('signing');
    try {
      const handle = post.author.handle ?? post.author.id;
      const { marketId } = await createMarketOnNear(
        {
          post: {
            source: post.source ?? 'x',
            post_id: post.id,
            author_ref: `${post.source ?? 'x'}:${handle}`,
            text: fitBytes(post.content, MAX_LONG),
          },
          claim_side: form.claimSide,
          rules: {
            question: form.question.trim(),
            description: form.description.trim(),
            yes_label: form.yesLabel.trim(),
            no_label: form.noLabel.trim(),
            yes_condition: form.yesCondition.trim(),
            no_condition: form.noCondition.trim(),
            resolution_source: form.source.trim(),
            invalid_conditions: form.invalidConditions.trim(),
            category: form.category,
            image_url: form.imageUrl.trim(),
            expiry_sec: String(expiry),
          },
          draft: { model: 'manual', chat_id: '' },
        },
        bond,
      );
      setCreated(marketId);
      setPhase('done');
      void queryClient.invalidateQueries({ queryKey: ['near'] });
    } catch (err) {
      setError((err as Error).message);
      setPhase('idle');
    }
  };

  const bondNear = bond === undefined ? '…' : String(Number(bond) / 1e24);

  return (
    <div className="flex flex-col gap-5" data-testid="create-market-form">
      <section className="rounded-lg border border-border bg-card px-4 py-3" data-testid="create-source-post">
        <div className="mb-1 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          From @{post.author.handle}
        </div>
        <p className="whitespace-pre-wrap break-words text-[13px] text-foreground">{post.content}</p>
      </section>

      <Field label="Question">
        <input data-testid="create-question" className={INPUT} value={form.question} onChange={(e) => set('question', e.target.value)} />
      </Field>
      <Field label="Description (optional)">
        <textarea className={INPUT} rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="First outcome label">
          <input className={INPUT} value={form.yesLabel} onChange={(e) => set('yesLabel', e.target.value)} />
        </Field>
        <Field label="Second outcome label">
          <input className={INPUT} value={form.noLabel} onChange={(e) => set('noLabel', e.target.value)} />
        </Field>
      </div>
      <Field label={`${form.yesLabel || 'First outcome'} if`}>
        <textarea data-testid="create-yes-condition" className={INPUT} rows={2} value={form.yesCondition} onChange={(e) => set('yesCondition', e.target.value)} />
      </Field>
      <Field label={`${form.noLabel || 'Second outcome'} if`}>
        <textarea data-testid="create-no-condition" className={INPUT} rows={2} value={form.noCondition} onChange={(e) => set('noCondition', e.target.value)} />
      </Field>
      <Field label="Invalid if">
        <textarea className={INPUT} rows={2} value={form.invalidConditions} onChange={(e) => set('invalidConditions', e.target.value)} />
      </Field>
      <Field label="Source" hint="The https page NEAR AI will read at the deadline.">
        <input data-testid="create-source" className={INPUT} placeholder="https://" value={form.source} onChange={(e) => set('source', e.target.value)} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Deadline">
          <input data-testid="create-deadline" type="datetime-local" className={INPUT} value={form.deadline} onChange={(e) => set('deadline', e.target.value)} />
        </Field>
        <Field label="Category">
          <select className={INPUT} value={form.category} onChange={(e) => set('category', e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="The author's side">
          <select data-testid="create-claim-side" className={INPUT} value={form.claimSide} onChange={(e) => set('claimSide', e.target.value as NearSide)}>
            <option value="yes">{form.yesLabel || 'First outcome'}</option>
            <option value="no">{form.noLabel || 'Second outcome'}</option>
          </select>
        </Field>
      </div>
      <Field label="Image link (optional)">
        <input className={INPUT} placeholder="https://" value={form.imageUrl} onChange={(e) => set('imageUrl', e.target.value)} />
      </Field>

      {shortOfNear && (
        <p data-testid="create-short-of-near" className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[12px] text-warning">
          Creating a market locks a {bondNear} NEAR bond, returned when it settles. This account needs about{' '}
          {Number(needed) / 1e24} NEAR on testnet.
        </p>
      )}
      {problem && <p data-testid="create-problem" className="text-[12px] text-muted-foreground">{problem}</p>}
      {error && <p data-testid="create-error" className="text-[12px] text-danger">{error}</p>}

      <Button data-testid="create-submit" disabled={!!problem || shortOfNear || bond === undefined || phase !== 'idle'} onClick={() => void submit()}>
        Lock rules and create · {bondNear} NEAR bond
      </Button>

      <Dialog open={phase !== 'idle'}>
        <DialogContent className="max-w-md border-0 bg-transparent p-0 shadow-none" showCloseButton={false}>
          <DialogTitle className="sr-only">Creating market</DialogTitle>
          {phase === 'done' && created ? (
            <MarketCreatedCard
              itemLabel="Your Market"
              itemTitle={form.question.trim()}
              url={`/market/${created}`}
              onDismiss={() => setPhase('idle')}
            />
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-8 text-center text-[13px]">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              Confirm in your wallet. This locks the rules on NEAR and places the bond.
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Create a market from one post: its rules are locked on chain in a single transaction. */
export function CreateFromPost({ postId }: { postId: string | null }) {
  const accountId = useNearWallet((s) => s.accountId);
  const status = useNearWallet((s) => s.status);
  const connect = useNearWallet((s) => s.connect);
  const { data: post, isLoading, isError } = useQuery({
    queryKey: ['feed-post', postId],
    queryFn: () => fetchPost(postId as string),
    enabled: !!postId,
    staleTime: Infinity,
  });

  let body: ReactNode;
  if (!postId) {
    body = (
      <CenteredNote>
        <p>Markets are created from a post. Pick one in the feed.</p>
        <Button asChild>
          <Link href="/">Go to the feed</Link>
        </Button>
      </CenteredNote>
    );
  } else if (!accountId) {
    body = (
      <CenteredNote>
        <p>Connect a NEAR wallet to create a market.</p>
        <Button disabled={status === 'loading'} onClick={() => void connect()}>
          {status === 'loading' ? 'Connecting…' : 'Connect wallet'}
        </Button>
      </CenteredNote>
    );
  } else if (isLoading) {
    body = <div className="h-40 animate-pulse rounded-lg bg-muted/40" aria-hidden />;
  } else if (isError || !post) {
    body = (
      <CenteredNote>
        <p>This post is no longer in the feed.</p>
        <Button asChild>
          <Link href="/">Back to the feed</Link>
        </Button>
      </CenteredNote>
    );
  } else {
    body = <CreateForm post={post} />;
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <h1 className="mb-4 text-[18px] font-bold">Create a market</h1>
      {body}
    </main>
  );
}
