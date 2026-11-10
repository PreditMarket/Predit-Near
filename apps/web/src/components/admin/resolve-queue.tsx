'use client';

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Clock, Globe, Inbox, Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ADMIN_RECIPIENT,
  type AdminConfirmMessage,
  type EvidenceBundle,
  type InvalidKind,
  type SuggestedOutcome,
} from '@/lib/near/evidence';
import { safeHttpUrl } from '@/lib/near/map';
import type { NearMarket } from '@/lib/near/types';
import { useNearWallet } from '@/store/near-wallet.store';

interface PendingItem {
  market: NearMarket;
  bundle: EvidenceBundle | null;
}

type Choice = 'yes' | 'no' | InvalidKind;

const LABEL = 'font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground';
const PANEL = 'rounded-xl border border-border/70 bg-card/60';

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const short = (text: string, head = 6, tail = 4) =>
  text.length > head + tail + 1 ? `${text.slice(0, head)}…${tail ? text.slice(-tail) : ''}` : text;

async function fetchPending(): Promise<{ admins: string[]; items: PendingItem[] }> {
  const res = await fetch('/api/admin/pending');
  if (!res.ok) throw new Error('Could not load the queue');
  return (await res.json()) as { admins: string[]; items: PendingItem[] };
}

function choiceOf(bundle: EvidenceBundle | null): Choice {
  const suggestion = bundle?.suggestion;
  if (!suggestion) return 'source_unavailable';
  return suggestion.outcome === 'invalid' ? (suggestion.invalidKind ?? 'source_unavailable') : suggestion.outcome;
}

function labelOf(market: NearMarket, choice: Choice): string {
  if (choice === 'yes') return market.rules.yes_label;
  if (choice === 'no') return market.rules.no_label;
  return choice === 'ambiguous_rules' ? 'Invalid · ambiguous rules' : 'Invalid · source unavailable';
}

const toneOf = (choice: Choice) =>
  choice === 'yes'
    ? 'border-success/40 bg-success/10 text-success'
    : choice === 'no'
      ? 'border-danger/40 bg-danger/10 text-danger'
      : 'border-warning/40 bg-warning/10 text-warning';

function ago(iso: string | number): string {
  const sec = Math.max(0, Math.round((Date.now() - (typeof iso === 'number' ? iso : Date.parse(iso))) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3_600) return `${Math.round(sec / 60)}m ago`;
  if (sec < 86_400) return `${Math.round(sec / 3_600)}h ago`;
  return `${Math.round(sec / 86_400)}d ago`;
}

/** The quoted phrases in NEAR AI's reason: the lines it says it relied on. */
function quotedIn(reason: string): string[] {
  return [...reason.matchAll(/["“]([^"”]{6,240})["”]/g)].map((m) => m[1].trim());
}

/** The snapshot with the quoted lines marked; the first mark scrolls into view. */
function Snapshot({ text, needles }: { text: string; needles: string[] }) {
  const box = useRef<HTMLPreElement>(null);
  const parts = useMemo(() => {
    const lower = text.toLowerCase();
    const hits: [number, number][] = [];
    for (const needle of needles) {
      const at = lower.indexOf(needle.toLowerCase());
      if (at >= 0) hits.push([at, at + needle.length]);
    }
    hits.sort((a, b) => a[0] - b[0]);
    const out: ReactNode[] = [];
    let last = 0;
    hits.forEach(([from, to], i) => {
      if (from < last) return;
      out.push(<Fragment key={`t${i}`}>{text.slice(last, from)}</Fragment>);
      out.push(
        <mark key={`m${i}`} data-testid="resolve-quote" className="rounded-[3px] bg-primary/25 px-0.5 text-foreground ring-1 ring-primary/50">
          {text.slice(from, to)}
        </mark>,
      );
      last = to;
    });
    out.push(<Fragment key="end">{text.slice(last)}</Fragment>);
    return out;
  }, [text, needles]);

  useEffect(() => {
    const mark = box.current?.querySelector('mark');
    if (mark && box.current) box.current.scrollTop = Math.max(0, (mark as HTMLElement).offsetTop - 120);
  }, [parts]);

  return (
    <pre
      ref={box}
      data-testid="resolve-snapshot"
      className="relative h-[460px] overflow-auto whitespace-pre-wrap break-words px-4 py-3 font-mono text-[11.5px] leading-relaxed text-muted-foreground"
    >
      {parts}
    </pre>
  );
}

function QueueItem({ item, active, onSelect }: { item: PendingItem; active: boolean; onSelect: () => void }) {
  const { market, bundle } = item;
  const choice = bundle?.suggestion ? choiceOf(bundle) : null;
  return (
    <button
      type="button"
      data-testid="resolve-item"
      data-market={market.id}
      aria-current={active}
      onClick={onSelect}
      className={`flex w-full flex-col gap-1.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${
        active ? 'border-primary/60 bg-primary/[0.07]' : 'border-transparent hover:border-border hover:bg-accent/30'
      }`}
    >
      <span className="line-clamp-2 text-[12.5px] font-medium leading-snug text-foreground">{market.rules.question}</span>
      <span className="flex items-center gap-2 font-mono text-[10.5px] text-muted-foreground">
        <Clock className="h-3 w-3" />
        ended {ago(Number(market.rules.expiry_sec) * 1000)}
        <span className="ml-auto">
          {choice ? (
            <span className={`rounded border px-1.5 py-0.5 font-bold uppercase ${toneOf(choice)}`}>AI · {labelOf(market, choice).split(' · ')[0]}</span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              {bundle ? 'reading' : 'snapshot'}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

function Review({ item, canConfirm }: { item: PendingItem; canConfirm: boolean }) {
  const { market, bundle } = item;
  const signMessage = useNearWallet((s) => s.signMessage);
  const accountId = useNearWallet((s) => s.accountId);
  const queryClient = useQueryClient();
  const [edited, setEdited] = useState<{ choice?: Choice; reason?: string }>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggested = bundle?.suggestion ? choiceOf(bundle) : null;
  const choice = edited.choice ?? choiceOf(bundle);
  const reason = edited.reason ?? bundle?.suggestion?.reason ?? '';
  const isSide = choice === 'yes' || choice === 'no';
  const blocked = !bundle ? 'Waiting for the snapshot.' : isSide && !bundle.ai ? 'YES or NO needs a NEAR AI reading first.' : null;
  const source = safeHttpUrl(market.rules.resolution_source);
  const needles = useMemo(() => (bundle?.suggestion ? quotedIn(bundle.suggestion.reason) : []), [bundle]);
  const overruled = suggested !== null && choice !== suggested;

  const confirm = async () => {
    if (!accountId) return;
    setBusy(true);
    setError(null);
    try {
      const outcome: SuggestedOutcome = isSide ? choice : 'invalid';
      const decision: AdminConfirmMessage = {
        app: ADMIN_RECIPIENT,
        marketId: market.id,
        outcome,
        invalidKind: isSide ? null : choice,
        reason: reason.trim(),
        issuedAt: Date.now(),
      };
      const message = JSON.stringify(decision);
      const nonce = crypto.getRandomValues(new Uint8Array(32));
      const signed = await signMessage({ message, recipient: ADMIN_RECIPIENT, nonce });
      const res = await fetch('/api/admin/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message, nonce: toBase64(nonce), ...signed }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error: string }).error);
      await queryClient.invalidateQueries({ queryKey: ['admin-pending'] });
      void queryClient.invalidateQueries({ queryKey: ['near'] });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const choices: Choice[] = ['yes', 'no', 'source_unavailable', 'ambiguous_rules'];

  return (
    <article data-testid="resolve-card" data-market={market.id} className="flex min-w-0 flex-col gap-4">
      <header className="flex flex-col gap-1.5">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10.5px] text-muted-foreground">
          <span>Market #{market.id}</span>
          <span>Deadline {new Date(Number(market.rules.expiry_sec) * 1000).toLocaleString()}</span>
          <span>by {short(market.creator, 14, 4)}</span>
        </span>
        <Link prefetch={false} href={`/market/${market.id}`} className="group inline-flex items-start gap-1.5 text-[18px] font-bold leading-snug hover:text-primary">
          {market.rules.question}
          <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 opacity-50 group-hover:opacity-100" />
        </Link>
      </header>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* What the agent saw */}
        <section className={`${PANEL} flex min-w-0 flex-col overflow-hidden`}>
          <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2">
            <span className="flex gap-1">
              <i className="block h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
              <i className="block h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
              <i className="block h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
            </span>
            <span className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md bg-background/70 px-2 py-1 font-mono text-[11px] text-muted-foreground">
              <Globe className="h-3 w-3 shrink-0" />
              <span className="truncate">{bundle?.sourceUrl ?? market.rules.resolution_source}</span>
            </span>
            {source && (
              <a href={source} target="_blank" rel="noopener noreferrer" className="font-mono text-[10.5px] text-primary hover:underline">
                Open
              </a>
            )}
          </div>
          {bundle ? (
            <>
              <Snapshot text={bundle.snapshot.text} needles={needles} />
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/70 px-3 py-2 font-mono text-[10.5px] text-muted-foreground">
                <span>Snapshot {new Date(bundle.capturedAt).toLocaleString()}</span>
                <span title={bundle.snapshot.hash}>sha256 {short(bundle.snapshot.hash, 10, 6)}</span>
                {bundle.snapshot.truncated && <span>truncated</span>}
              </div>
            </>
          ) : (
            <p className="flex h-[460px] items-center justify-center gap-2 text-[12.5px] text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              The agent has not read the source yet.
            </p>
          )}
        </section>

        <div className="flex min-w-0 flex-col gap-4">
          {/* What NEAR AI said */}
          <section data-testid="resolve-suggestion-panel" className={`${PANEL} flex flex-col gap-3 p-4`}>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className={LABEL}>{bundle?.ai ? 'NEAR AI reading' : 'Suggestion'}</span>
              {bundle?.ai && (
                <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-success">
                  <ShieldCheck className="h-3 w-3" />
                  Signed in TEE
                </span>
              )}
            </div>
            {bundle?.suggestion && suggested ? (
              <div data-testid="resolve-suggestion" className="flex flex-col gap-2">
                <span className={`self-start rounded-lg border px-3 py-1.5 text-[20px] font-extrabold uppercase tracking-wide ${toneOf(suggested)}`}>
                  {labelOf(market, suggested)}
                </span>
                <p className="text-[13px] leading-relaxed text-foreground">{bundle.suggestion.reason}</p>
                {bundle.ai && (
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-[10.5px] text-muted-foreground">
                    <dt>model</dt>
                    <dd className="truncate text-foreground/80">{bundle.ai.model}</dd>
                    <dt>signer</dt>
                    <dd className="truncate text-foreground/80" title={bundle.ai.signingAddress}>
                      {short(bundle.ai.signingAddress, 8, 6)}
                    </dd>
                    <dt>chat</dt>
                    <dd className="truncate text-foreground/80">{short(bundle.ai.chatId, 14, 6)}</dd>
                  </dl>
                )}
              </div>
            ) : (
              <p className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {bundle ? 'NEAR AI has not answered yet. It retries by itself.' : 'Waiting for the snapshot.'}
              </p>
            )}
          </section>

          {/* The locked rules */}
          <section className={`${PANEL} grid gap-2.5 p-4 text-[12px] leading-snug`}>
            <span className={LABEL}>Rules locked on chain</span>
            <p>
              <span className="mr-1.5 font-mono text-[10.5px] font-bold uppercase text-success">{market.rules.yes_label} if</span>
              {market.rules.yes_condition}
            </p>
            <p>
              <span className="mr-1.5 font-mono text-[10.5px] font-bold uppercase text-danger">{market.rules.no_label} if</span>
              {market.rules.no_condition}
            </p>
            <p className="text-muted-foreground">
              <span className="mr-1.5 font-mono text-[10.5px] font-bold uppercase text-warning">Invalid if</span>
              {market.rules.invalid_conditions}
            </p>
          </section>

          {/* The person who decides */}
          {canConfirm && (
            <section className={`${PANEL} flex flex-col gap-3 p-4`}>
              <span className={LABEL}>Your decision</span>
              <div role="radiogroup" aria-label="Your decision" data-testid="resolve-choice" className="grid grid-cols-2 gap-1.5">
                {choices.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={choice === c}
                    data-testid={`resolve-choice-${c}`}
                    onClick={() => setEdited((v) => ({ ...v, choice: c }))}
                    className={`rounded-lg border px-2.5 py-2 text-left text-[12px] font-semibold transition-colors ${
                      choice === c ? toneOf(c) : 'border-border/70 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {labelOf(market, c)}
                    {c === suggested && <span className="ml-1.5 font-mono text-[9.5px] font-bold opacity-70">AI</span>}
                  </button>
                ))}
              </div>
              {choice === 'ambiguous_rules' && <p className="text-[11.5px] text-warning">Ambiguous rules cost the creator their bond.</p>}
              {overruled && <p className="text-[11.5px] text-muted-foreground">You are overruling NEAR AI. Say why below.</p>}
              <label className="flex flex-col gap-1.5">
                <span className={LABEL}>Reason, public on chain</span>
                <textarea
                  data-testid="resolve-reason"
                  rows={3}
                  value={reason}
                  onChange={(e) => setEdited((v) => ({ ...v, reason: e.target.value }))}
                  className="w-full resize-none rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-[12.5px] leading-relaxed text-foreground outline-none focus:border-primary/70"
                />
              </label>
              {blocked && <p className="text-[12px] text-muted-foreground">{blocked}</p>}
              {error && <p data-testid="resolve-error" className="text-[12px] text-danger">{error}</p>}
              <Button data-testid="resolve-confirm" disabled={!!blocked || !reason.trim() || busy} onClick={() => void confirm()}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                Sign and post the result
              </Button>
              <p className="text-[11px] text-muted-foreground">Your wallet signs the decision. It goes on chain and stays open to challenge.</p>
            </section>
          )}
        </div>
      </div>
    </article>
  );
}

/** Expired markets: what the agent saw, what NEAR AI read, and the person who decides. */
export function ResolveQueue() {
  const accountId = useNearWallet((s) => s.accountId);
  const connect = useNearWallet((s) => s.connect);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-pending'],
    queryFn: fetchPending,
    refetchInterval: 15_000,
  });
  const canConfirm = !!accountId && !!data?.admins.includes(accountId);
  const [picked, setPicked] = useState<string | null>(null);
  const items = data?.items ?? [];
  const selected = items.find((i) => i.market.id === picked) ?? items[0] ?? null;
  const read = items.filter((i) => i.bundle?.suggestion).length;

  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-5 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[20px] font-bold">Result review</h1>
          <p className="text-[12.5px] text-muted-foreground">NEAR AI only suggests. A person decides, signs with their wallet, and the result stays open to challenge.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
          {data && (
            <>
              <span className="rounded-full border border-border/70 px-2.5 py-1 text-muted-foreground">{items.length} waiting</span>
              <span className="rounded-full border border-border/70 px-2.5 py-1 text-muted-foreground">{read} read by NEAR AI</span>
            </>
          )}
          {accountId ? (
            <span
              data-testid={canConfirm ? 'resolve-admin' : 'resolve-not-admin'}
              className={`rounded-full border px-2.5 py-1 ${canConfirm ? 'border-success/40 bg-success/10 text-success' : 'border-border/70 text-muted-foreground'}`}
            >
              {canConfirm ? `Admin · ${short(accountId, 24, 0)}` : `${accountId} is not an admin, so this queue is read-only.`}
            </span>
          ) : (
            <Button size="sm" onClick={() => void connect()}>
              Connect an admin wallet
            </Button>
          )}
        </div>
      </header>

      {isLoading && <div className="h-[520px] animate-pulse rounded-xl bg-muted/40" aria-hidden />}
      {isError && <p className="text-[13px] text-muted-foreground">Could not load the queue.</p>}
      {data && items.length === 0 && (
        <div data-testid="resolve-empty" className={`${PANEL} flex flex-col items-center gap-2 py-16 text-center text-[13px] text-muted-foreground`}>
          <Inbox className="h-6 w-6" />
          Nothing is waiting. Markets show up here once their deadline passes.
        </div>
      )}
      {selected && (
        <div className="grid items-start gap-5 md:grid-cols-[260px_minmax(0,1fr)]">
          <nav aria-label="Waiting markets" className="flex flex-col gap-1 md:sticky md:top-[calc(56px+var(--nav-y,0px))]">
            <span className={`${LABEL} px-1 pb-1`}>Waiting</span>
            {items.map((item) => (
              <QueueItem key={item.market.id} item={item} active={item.market.id === selected.market.id} onSelect={() => setPicked(item.market.id)} />
            ))}
          </nav>
          <Review key={selected.market.id} item={selected} canConfirm={canConfirm} />
        </div>
      )}
    </main>
  );
}
