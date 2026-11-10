'use client';

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Loader2, Plus, Send, ShieldCheck, Sparkles } from 'lucide-react';
import { ColumnBar, ColumnTitle } from '@/components/app-shell/column-bar';
import { QuickTradeDialog } from '@/components/pamm/quick-trade-dialog';
import { Button } from '@/components/ui/button';
import { getAllNearMarkets } from '@/lib/near/contract';
import { isTradable, phaseLabel, toPammMarket } from '@/lib/near/map';
import type { NearMarket } from '@/lib/near/types';
import type { PostDto } from '@/services/feed.service';
import { useCreateMarketDialog } from '@/store/create-market-dialog.store';
import { useNearWallet } from '@/store/near-wallet.store';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  chatId?: string;
  signer?: string | null;
}

const KEPT = 30;
const SUGGESTIONS = [
  'Which markets close soonest?',
  'Which posts here make a prediction?',
  'How does a market get its result?',
];
const RAIL =
  'sticky top-[calc(40px+var(--nav-y,0px))] h-[calc(var(--app-h)-40px-var(--banner-h,0px)-var(--nav-y,0px))] flex flex-col border-l border-border/60 bg-background/62 backdrop-blur-[20px] backdrop-saturate-[160%]';
const TOKEN = /\[\[(market|post):([^\]\s]{1,80})\]\]/g;

const storageKey = (accountId: string) => `predit.near-ai-chat.${accountId}`;
function loadHistory(accountId: string): Message[] {
  try {
    return JSON.parse(localStorage.getItem(storageKey(accountId)) ?? '[]') as Message[];
  } catch {
    return [];
  }
}
function saveHistory(accountId: string, messages: Message[]) {
  try {
    localStorage.setItem(storageKey(accountId), JSON.stringify(messages.slice(-KEPT)));
  } catch {
    // Kept for this page only.
  }
}

async function fetchPost(id: string): Promise<PostDto | null> {
  const res = await fetch(`/api/feed?id=${encodeURIComponent(id)}`);
  return res.ok ? ((await res.json()) as { post: PostDto }).post : null;
}

function MarketChip({ id, markets, onTrade }: { id: string; markets: Map<string, NearMarket>; onTrade: (m: NearMarket) => void }) {
  const market = markets.get(id);
  if (!market) return <span className="font-mono text-[11px] text-muted-foreground">market {id}</span>;
  const tradable = isTradable(market);
  const yes = (market.price_yes_bps / 100).toFixed(0);
  const inner = (
    <>
      <span className="line-clamp-2 text-[12px] font-medium text-foreground">{market.rules.question}</span>
      <span className="font-mono text-[10.5px] text-muted-foreground">
        {tradable ? `${market.rules.yes_label} ${yes}% · tap to bet` : phaseLabel(market)}
      </span>
    </>
  );
  const chip = 'my-1 flex w-full flex-col gap-0.5 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-left hover:border-primary/60';
  return tradable ? (
    <button type="button" data-testid="ai-market-chip" data-market={id} className={chip} onClick={() => onTrade(market)}>
      {inner}
    </button>
  ) : (
    <Link prefetch={false} href={`/market/${id}`} data-testid="ai-market-chip" data-market={id} className={chip}>
      {inner}
    </Link>
  );
}

function PostChip({ id }: { id: string }) {
  const openCreate = useCreateMarketDialog((s) => s.openFor);
  const { data: post } = useQuery({ queryKey: ['feed-post', id], queryFn: () => fetchPost(id), staleTime: 300_000 });
  return (
    <span data-testid="ai-post-chip" data-post={id} className="my-1 flex w-full flex-col gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5">
      <span className="line-clamp-2 text-[12px] text-foreground">
        {post ? (
          <>
            <span className="font-mono text-muted-foreground">@{post.author.handle} </span>
            {post.content}
          </>
        ) : (
          `Post ${id}`
        )}
      </span>
      <button
        type="button"
        onClick={() => openCreate(id)}
        className="inline-flex items-center gap-1 self-start font-mono text-[10.5px] font-semibold text-primary hover:underline"
      >
        <Plus className="h-3 w-3" />
        Create market
      </button>
    </span>
  );
}

/** Plain text with **bold**, keeping line breaks. */
function Text({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
      )}
    </>
  );
}

function Answer({ content, markets, onTrade }: { content: string; markets: Map<string, NearMarket>; onTrade: (m: NearMarket) => void }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of content.matchAll(TOKEN)) {
    parts.push(<Text key={`t${last}`} text={content.slice(last, match.index)} />);
    parts.push(
      match[1] === 'market' ? (
        <MarketChip key={`m${match.index}`} id={match[2]} markets={markets} onTrade={onTrade} />
      ) : (
        <PostChip key={`p${match.index}`} id={match[2]} />
      ),
    );
    last = (match.index ?? 0) + match[0].length;
  }
  parts.push(<Text key="end" text={content.slice(last)} />);
  return <div className="whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-foreground">{parts}</div>;
}

/** The right column: questions about Predit's markets and feed, answered by Predit AI (NEAR AI in a TEE). */
export function RightRailNearAi({ onCollapse }: { onCollapse: () => void }) {
  const accountId = useNearWallet((s) => s.accountId);
  const connect = useNearWallet((s) => s.connect);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trading, setTrading] = useState<NearMarket | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const { data: allMarkets } = useQuery({ queryKey: ['near', 'all-markets'], queryFn: getAllNearMarkets, refetchInterval: 15_000 });
  const markets = new Map((allMarkets ?? []).map((m) => [m.id, m]));

  useEffect(() => {
    setMessages(accountId ? loadHistory(accountId) : []);
  }, [accountId]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages, asking]);

  const update = (next: Message[]) => {
    setMessages(next);
    if (accountId) saveHistory(accountId, next);
  };

  const ask = async (question: string) => {
    const text = question.trim();
    if (!accountId || !text || asking) return;
    setError(null);
    setDraft('');
    const history = [...messages, { role: 'user' as const, content: text }];
    update(history);
    setAsking(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accountId, messages: history.map(({ role, content }) => ({ role, content })) }),
      });
      const body = (await res.json()) as { answer?: string; chatId?: string; error?: string };
      if (!res.ok || !body.answer) throw new Error(body.error ?? 'Predit AI did not answer');
      const answered = [...history, { role: 'assistant' as const, content: body.answer, chatId: body.chatId }];
      update(answered);
      // The enclave's signature comes a moment after the answer.
      if (body.chatId) {
        for (let tries = 0; tries < 4; tries += 1) {
          const sig = await fetch(`/api/chat/signature?id=${encodeURIComponent(body.chatId)}`);
          if (sig.ok) {
            const { signer } = (await sig.json()) as { signer: string };
            update(answered.map((m) => (m.chatId === body.chatId ? { ...m, signer } : m)));
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 2_000));
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAsking(false);
    }
  };

  return (
    <aside className={RAIL} aria-label="Predit AI" data-testid="right-rail">
      <ColumnBar className="gap-1.5">
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Collapse Predit AI"
          title="Collapse"
          className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-[5px] text-muted-foreground transition-colors hover:bg-accent/70 hover:text-white"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
        <ColumnTitle>Predit AI</ColumnTitle>
        {messages.length > 0 && (
          <button
            type="button"
            data-testid="ai-new-chat"
            onClick={() => update([])}
            className="ml-auto inline-flex items-center gap-1 rounded-[5px] px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground hover:bg-accent/70 hover:text-white"
          >
            <Plus className="h-3 w-3" />
            New chat
          </button>
        )}
      </ColumnBar>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {messages.length === 0 && (
          <div className="flex flex-col gap-3">
            <p className="flex items-start gap-2 text-[12.5px] text-muted-foreground">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              Ask about the markets and posts here. Predit AI answers from what is on chain and in the feed. It runs on NEAR AI in a TEE that signs each answer.
            </p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                data-testid="ai-suggestion"
                disabled={!accountId || asking}
                onClick={() => void ask(s)}
                className="rounded-lg border border-border px-3 py-2 text-left text-[12px] text-foreground hover:border-primary/60 disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-3">
          {messages.map((m, i) =>
            m.role === 'user' ? (
              <div key={i} data-testid="ai-question" className="self-end rounded-lg bg-primary/15 px-3 py-2 text-[12.5px] text-foreground">
                {m.content}
              </div>
            ) : (
              <div key={i} data-testid="ai-answer" className="flex flex-col gap-1">
                <Answer content={m.content} markets={markets} onTrade={setTrading} />
                {m.signer && (
                  <span
                    data-testid="ai-signed"
                    title={`Chat ${m.chatId}`}
                    className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground"
                  >
                    <ShieldCheck className="h-3 w-3 text-success" />
                    Signed by NEAR AI · {m.signer.slice(0, 6)}…{m.signer.slice(-4)}
                  </span>
                )}
              </div>
            ),
          )}
          {asking && (
            <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Predit AI is thinking…
            </p>
          )}
          {error && <p data-testid="ai-error" className="text-[12px] text-danger">{error}</p>}
          <div ref={end} />
        </div>
      </div>

      <div className="border-t border-border/60 p-2.5">
        {accountId ? (
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(draft);
            }}
          >
            <textarea
              data-testid="ai-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void ask(draft);
                }
              }}
              rows={2}
              maxLength={500}
              placeholder="Ask Predit AI…"
              className="min-h-[40px] flex-1 resize-none rounded-md border border-border bg-background px-2.5 py-2 text-[12.5px] text-foreground outline-none focus:border-primary"
            />
            <Button type="submit" size="icon" data-testid="ai-send" disabled={!draft.trim() || asking} aria-label="Ask">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        ) : (
          <Button className="w-full" data-testid="ai-connect" onClick={() => void connect()}>
            Connect a wallet to ask Predit AI
          </Button>
        )}
      </div>

      {trading && (
        <QuickTradeDialog
          market={toPammMarket(trading)}
          open
          initialSide="yes"
          preset={{ amountUsd: 5 }}
          onOpenChange={(open) => !open && setTrading(null)}
        />
      )}
    </aside>
  );
}
