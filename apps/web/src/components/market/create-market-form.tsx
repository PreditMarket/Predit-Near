'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createMarketOnNear, CREATE_MARKET_MARGIN, getNearCreationBond } from '@/lib/near/contract';
import { fitBytes, MAX_LABEL, MAX_LONG, MAX_SHORT, textBytes as bytes, type MarketDraft } from '@/lib/near/market-draft';
import { safeHttpUrl } from '@/lib/near/map';
import { getNearNativeBalance } from '@/lib/near/rpc';
import type { NearSide } from '@/lib/near/types';
import { getCategories } from '@/services/categories.service';
import type { PostDto } from '@/services/feed.service';
import { useNearWallet } from '@/store/near-wallet.store';

const MIN_LEAD_MS = 10 * 60_000;
const DEFAULT_LEAD_MS = 7 * 24 * 3_600_000;

const INPUT =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none focus:border-primary';

/** The value a datetime-local input expects, in the viewer's time zone. */
function localDateTime(ms: number): string {
  const date = new Date(ms);
  return new Date(ms - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="text-[11.5px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

export async function fetchPost(id: string): Promise<PostDto | null> {
  const res = await fetch(`/api/feed?id=${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Could not load the post');
  return ((await res.json()) as { post: PostDto }).post;
}

type PostDraft = { draft: MarketDraft; model: string; chatId: string };

async function fetchDraft(postId: string): Promise<PostDraft> {
  const res = await fetch(`/api/draft?post=${encodeURIComponent(postId)}`);
  if (!res.ok) throw new Error('No draft');
  return (await res.json()) as PostDraft;
}

function AiNote({ drafting, failed }: { drafting: boolean; failed: boolean }) {
  return (
    <p data-testid="create-ai-note" className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-[12px] text-foreground">
      {drafting ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" /> : <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />}
      {drafting
        ? 'NEAR AI is drafting this market from the post. This can take up to a minute…'
        : failed
          ? 'NEAR AI could not draft this post. Fill in the market yourself.'
          : 'Drafted by NEAR AI. Check every field and open the source: the rules cannot change once locked.'}
    </p>
  );
}

/**
 * Creating a market from one post: NEAR AI drafts it, the creator checks it,
 * and one transaction locks the rules and places the bond.
 */
export function CreateMarketForm({
  post,
  onCreated,
}: {
  post: PostDto;
  onCreated: (market: { id: string; question: string }) => void;
}) {
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
  const touched = useRef(new Set<string>());
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    touched.current.add(key);
    setForm((f) => ({ ...f, [key]: value }));
  };

  const {
    data: ai,
    isLoading: drafting,
    isError: draftFailed,
  } = useQuery({
    queryKey: ['post-draft', post.id],
    queryFn: () => fetchDraft(post.id),
    staleTime: Infinity,
    retry: false,
  });
  // A field the creator already edited keeps their words.
  useEffect(() => {
    if (!ai) return;
    const { deadlineMs, ...texts } = ai.draft;
    const fields = deadlineMs ? { ...texts, deadline: localDateTime(deadlineMs) } : texts;
    const unedited = Object.entries(fields).filter(([key, value]) => value && !touched.current.has(key));
    setForm((f) => ({ ...f, ...Object.fromEntries(unedited) }));
  }, [ai]);

  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

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
    setSigning(true);
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
          draft: ai ? { model: ai.model, chat_id: ai.chatId } : { model: 'manual', chat_id: '' },
        },
        bond,
      );
      void queryClient.invalidateQueries({ queryKey: ['near'] });
      onCreated({ id: marketId, question: form.question.trim() });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSigning(false);
    }
  };

  const bondNear = bond === undefined ? '…' : String(Number(bond) / 1e24);

  // A problem in a field kept under "More options" opens it.
  const hiddenProblem = !!problem && /label|invalid|image|texts/i.test(problem);

  return (
    <div className="flex flex-col gap-4" data-testid="create-market-form">
      <section className="rounded-lg border border-border bg-card px-3 py-2" data-testid="create-source-post">
        <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">From @{post.author.handle}</div>
        <p className="line-clamp-3 whitespace-pre-wrap break-words text-[12.5px] text-foreground">{post.content}</p>
      </section>

      <AiNote drafting={drafting} failed={draftFailed} />

      <Field label="Question">
        <input data-testid="create-question" className={INPUT} value={form.question} onChange={(e) => set('question', e.target.value)} />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={`${form.yesLabel || 'Yes'} if`}>
          <textarea data-testid="create-yes-condition" className={INPUT} rows={2} value={form.yesCondition} onChange={(e) => set('yesCondition', e.target.value)} />
        </Field>
        <Field label={`${form.noLabel || 'No'} if`}>
          <textarea data-testid="create-no-condition" className={INPUT} rows={2} value={form.noCondition} onChange={(e) => set('noCondition', e.target.value)} />
        </Field>
      </div>
      <Field
        label="Source"
        hint={
          <>
            The https page NEAR AI will read at the deadline.
            {safeHttpUrl(form.source) && (
              <>
                {' '}
                <a data-testid="create-source-open" href={safeHttpUrl(form.source) as string} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  Open it
                </a>
              </>
            )}
          </>
        }
      >
        <input data-testid="create-source" className={INPUT} placeholder="https://" value={form.source} onChange={(e) => set('source', e.target.value)} />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Deadline">
          <input data-testid="create-deadline" type="datetime-local" className={INPUT} value={form.deadline} onChange={(e) => set('deadline', e.target.value)} />
        </Field>
        <Field label="The author's side">
          <select data-testid="create-claim-side" className={INPUT} value={form.claimSide} onChange={(e) => set('claimSide', e.target.value as NearSide)}>
            <option value="yes">{form.yesLabel || 'Yes'}</option>
            <option value="no">{form.noLabel || 'No'}</option>
          </select>
        </Field>
      </div>

      <div className="rounded-lg border border-border">
        <button
          type="button"
          data-testid="create-more"
          onClick={() => setMoreOpen((v) => !v)}
          className="flex w-full items-center justify-between px-3 py-2 font-mono text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          More options: labels, invalid rule, description, category, image
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${moreOpen || hiddenProblem ? 'rotate-180' : ''}`} />
        </button>
        {(moreOpen || hiddenProblem) && (
          <div className="flex flex-col gap-3 border-t border-border p-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="First outcome label">
                <input className={INPUT} value={form.yesLabel} onChange={(e) => set('yesLabel', e.target.value)} />
              </Field>
              <Field label="Second outcome label">
                <input className={INPUT} value={form.noLabel} onChange={(e) => set('noLabel', e.target.value)} />
              </Field>
            </div>
            <Field label="Invalid if">
              <textarea className={INPUT} rows={2} value={form.invalidConditions} onChange={(e) => set('invalidConditions', e.target.value)} />
            </Field>
            <Field label="Description (optional)">
              <textarea className={INPUT} rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Category">
                <select className={INPUT} value={form.category} onChange={(e) => set('category', e.target.value)}>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Image link (optional)">
                <input className={INPUT} placeholder="https://" value={form.imageUrl} onChange={(e) => set('imageUrl', e.target.value)} />
              </Field>
            </div>
          </div>
        )}
      </div>

      {shortOfNear && (
        <p data-testid="create-short-of-near" className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[12px] text-warning">
          {bond
            ? `Creating a market locks a ${bondNear} NEAR bond, returned when it settles.`
            : 'Creating a market only pays for the storage it takes; the rest comes back in the same transaction.'}{' '}
          This account needs about {Number(needed) / 1e24} NEAR on testnet.
        </p>
      )}
      {problem && <p data-testid="create-problem" className="text-[12px] text-muted-foreground">{problem}</p>}
      {error && <p data-testid="create-error" className="text-[12px] text-danger">{error}</p>}

      <Button data-testid="create-submit" disabled={!!problem || drafting || shortOfNear || bond === undefined || signing} onClick={() => void submit()}>
        {signing ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Confirm in your wallet…
          </>
        ) : (
          bond ? `Lock rules and create · ${bondNear} NEAR bond` : 'Lock rules and create'
        )}
      </Button>
    </div>
  );
}
