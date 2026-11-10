'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ADMIN_RECIPIENT,
  type AdminConfirmMessage,
  type EvidenceBundle,
  type InvalidKind,
  type SuggestedOutcome,
} from '@/lib/near/evidence';
import type { NearMarket } from '@/lib/near/types';
import { useNearWallet } from '@/store/near-wallet.store';

interface PendingItem {
  market: NearMarket;
  bundle: EvidenceBundle | null;
}

type Choice = 'yes' | 'no' | InvalidKind;

const INPUT =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none focus:border-primary';
const LABEL = 'font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground';

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

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

function describe(market: NearMarket, bundle: EvidenceBundle): string {
  const suggestion = bundle.suggestion;
  if (!suggestion) return '';
  if (suggestion.outcome === 'yes') return market.rules.yes_label;
  if (suggestion.outcome === 'no') return market.rules.no_label;
  return suggestion.invalidKind === 'ambiguous_rules' ? 'Invalid: ambiguous rules' : 'Invalid: source unavailable';
}

function PendingCard({ item, canConfirm }: { item: PendingItem; canConfirm: boolean }) {
  const { market, bundle } = item;
  const signMessage = useNearWallet((s) => s.signMessage);
  const accountId = useNearWallet((s) => s.accountId);
  const queryClient = useQueryClient();
  const [edited, setEdited] = useState<{ choice?: Choice; reason?: string }>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choice = edited.choice ?? choiceOf(bundle);
  const reason = edited.reason ?? bundle?.suggestion?.reason ?? '';
  const isSide = choice === 'yes' || choice === 'no';
  const blocked = !bundle ? 'Waiting for the snapshot.' : isSide && !bundle.ai ? 'YES or NO needs a NEAR AI reading first.' : null;

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

  return (
    <article data-testid="resolve-card" data-market={market.id} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <Link prefetch={false} href={`/market/${market.id}`} className="text-[14px] font-bold hover:underline">
        {market.rules.question}
      </Link>
      <dl className="grid gap-2 text-[12.5px]">
        <div>
          <dt className={LABEL}>{market.rules.yes_label} if</dt>
          <dd>{market.rules.yes_condition}</dd>
        </div>
        <div>
          <dt className={LABEL}>{market.rules.no_label} if</dt>
          <dd>{market.rules.no_condition}</dd>
        </div>
        <div>
          <dt className={LABEL}>Invalid if</dt>
          <dd>{market.rules.invalid_conditions}</dd>
        </div>
      </dl>

      {!bundle && <p className="text-[12px] text-muted-foreground">The agent has not read the source yet.</p>}
      {bundle && (
        <details>
          <summary className="cursor-pointer text-[12px] text-primary">
            Source snapshot, {new Date(bundle.capturedAt).toLocaleString()}
          </summary>
          <p className="mt-1 text-[11.5px] text-muted-foreground">{bundle.sourceUrl}</p>
          <pre data-testid="resolve-snapshot" className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-background p-3 text-[11.5px]">
            {bundle.snapshot.text}
          </pre>
        </details>
      )}
      {bundle?.suggestion ? (
        <p data-testid="resolve-suggestion" className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-[12.5px]">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span>
            <strong>{bundle.ai ? 'NEAR AI suggests' : 'Suggested'}: {describe(market, bundle)}.</strong> {bundle.suggestion.reason}
          </span>
        </p>
      ) : (
        bundle && <p className="text-[12px] text-muted-foreground">NEAR AI has not answered yet. It retries by itself.</p>
      )}

      {canConfirm && (
        <>
          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>Your decision</span>
            <select data-testid="resolve-choice" className={INPUT} value={choice} onChange={(e) => setEdited((v) => ({ ...v, choice: e.target.value as Choice }))}>
              <option value="yes">{market.rules.yes_label}</option>
              <option value="no">{market.rules.no_label}</option>
              <option value="source_unavailable">Invalid: source unavailable</option>
              <option value="ambiguous_rules">Invalid: ambiguous rules (creator loses the bond)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>Reason, public on chain</span>
            <textarea data-testid="resolve-reason" className={INPUT} rows={3} value={reason} onChange={(e) => setEdited((v) => ({ ...v, reason: e.target.value }))} />
          </label>
          {blocked && <p className="text-[12px] text-muted-foreground">{blocked}</p>}
          {error && <p data-testid="resolve-error" className="text-[12px] text-danger">{error}</p>}
          <Button data-testid="resolve-confirm" disabled={!!blocked || !reason.trim() || busy} onClick={() => void confirm()}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Confirm and post the result
          </Button>
        </>
      )}
    </article>
  );
}

/** Expired markets: NEAR AI's reading, and the person who decides. */
export function ResolveQueue() {
  const accountId = useNearWallet((s) => s.accountId);
  const connect = useNearWallet((s) => s.connect);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-pending'],
    queryFn: fetchPending,
    refetchInterval: 15_000,
  });
  const canConfirm = !!accountId && !!data?.admins.includes(accountId);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-[18px] font-bold">Confirm results</h1>
        <p className="text-[12.5px] text-muted-foreground">
          NEAR AI only suggests. Your wallet signs the decision and it stays open to challenge after it is posted.
        </p>
      </header>
      {!accountId && (
        <Button className="self-start" onClick={() => void connect()}>
          Connect an admin wallet
        </Button>
      )}
      {accountId && data && !canConfirm && (
        <p data-testid="resolve-not-admin" className="text-[12.5px] text-muted-foreground">
          {accountId} is not an admin, so this queue is read-only.
        </p>
      )}
      {isLoading && <div className="h-40 animate-pulse rounded-lg bg-muted/40" aria-hidden />}
      {isError && <p className="text-[13px] text-muted-foreground">Could not load the queue.</p>}
      {data?.items.length === 0 && <p data-testid="resolve-empty" className="text-[13px] text-muted-foreground">Nothing is waiting.</p>}
      {data?.items.map((item) => (
        <PendingCard key={item.market.id} item={item} canConfirm={canConfirm} />
      ))}
    </main>
  );
}
