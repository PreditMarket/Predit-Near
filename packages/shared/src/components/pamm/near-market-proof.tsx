'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Loader2 } from 'lucide-react';

import { useWalletGate } from '@/hooks/use-wallet-gate';
import { challengeOnNear, getNearChallengeBond, getNearMarket } from '@/lib/near/contract';
import { nowSec, outcomeLabel, postUrl, safeHttpUrl } from '@/lib/near/map';
import type { NearMarket } from '@/lib/near/types';

const LABEL = 'font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground';

const when = (sec: string | number) =>
  new Date(Number(sec) * 1000).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className={LABEL}>{label}</span>
      <span className="break-words text-[12.5px] text-foreground">{children}</span>
    </div>
  );
}

function Outbound({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-primary hover:underline"
    >
      {children}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

function SourcePost({ market }: { market: NearMarket }) {
  const href = postUrl(market.post);
  const handle = /^x:(.+)$/.exec(market.post.author_ref)?.[1];
  return (
    <section className="flex flex-col gap-2 px-[18px] py-4" data-testid="market-source-post">
      <div className={LABEL}>Created from this post</div>
      <p className="whitespace-pre-wrap break-words text-[13px] text-foreground">{market.post.text}</p>
      <div className="flex flex-wrap items-center gap-3 text-[11.5px] text-muted-foreground">
        {handle ? (
          <Link prefetch={false} href={`/u/@${handle}`} data-testid="market-author-record" className="text-primary hover:underline">
            @{handle}&apos;s record
          </Link>
        ) : (
          <span>{market.post.author_ref}</span>
        )}
        <span>
          The author {market.claim_side === 'yes' ? market.rules.yes_label : market.rules.no_label} side
        </span>
        {href && <Outbound href={href}>View on X</Outbound>}
      </div>
    </section>
  );
}

function LockedRules({ market }: { market: NearMarket }) {
  const source = safeHttpUrl(market.rules.resolution_source);
  return (
    <section className="flex flex-col gap-3 border-t border-border px-[18px] py-4" data-testid="market-locked-rules">
      <div className={LABEL}>Rules locked on chain</div>
      <Row label="Invalid if">{market.rules.invalid_conditions}</Row>
      <Row label="Source">
        {source ? <Outbound href={source}>{source}</Outbound> : market.rules.resolution_source}
      </Row>
      <Row label="Rules hash">
        <span className="font-mono text-[11px]">{market.rules_hash}</span>
      </Row>
    </section>
  );
}

const MAX_REASON_BYTES = 600;

function ChallengeForm({ market }: { market: NearMarket }) {
  const gate = useWalletGate();
  const queryClient = useQueryClient();
  const { data: bond } = useQuery({ queryKey: ['near', 'challenge-bond'], queryFn: getNearChallengeBond });
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tooLong = new TextEncoder().encode(reason).length > MAX_REASON_BYTES;

  const submit = async () => {
    if (bond === undefined) return;
    setBusy(true);
    setError(null);
    try {
      await challengeOnNear(market.id, reason.trim(), bond);
      await queryClient.invalidateQueries({ queryKey: ['near'] });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3" data-testid="market-challenge">
      <p className="text-[12px]">
        Think this result is wrong? Challenge it. You lock {bond === undefined ? '…' : Number(bond) / 1e24} NEAR, returned if the arbiter agrees with you and lost if not.
      </p>
      <textarea
        data-testid="challenge-reason"
        rows={2}
        placeholder="Why the result is wrong, with a link"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-[12.5px] text-foreground outline-none focus:border-primary"
      />
      {error && <p data-testid="challenge-error" className="text-[12px] text-danger">{error}</p>}
      <button
        type="button"
        data-testid="challenge-submit"
        disabled={!reason.trim() || tooLong || busy || bond === undefined || gate.connecting}
        onClick={gate.handleAction(() => void submit())}
        className="inline-flex items-center justify-center gap-1.5 self-start rounded-md bg-warning px-3 py-1.5 font-mono text-[11.5px] font-bold text-black disabled:opacity-50"
      >
        {busy && <Loader2 className="h-3 w-3 animate-spin" />}
        Challenge this result
      </button>
    </div>
  );
}

function Receipt({ market }: { market: NearMarket }) {
  const { receipt, challenge } = market;
  if (!receipt) return null;
  const evidence = safeHttpUrl(receipt.evidence.uri);
  const closesAt = Number(receipt.posted_at_sec) + market.challenge_window_sec;
  return (
    <section id="receipt" className="flex flex-col gap-3 border-t border-border px-[18px] py-4" data-testid="market-receipt">
      <div className={LABEL}>Result receipt</div>
      <Row label={market.status === 'finalized' ? 'Result' : 'Proposed result'}>
        <span className="font-bold">{outcomeLabel(market, receipt.outcome)}</span>
      </Row>
      <Row label="Reason">{receipt.reason}</Row>
      <Row label="Posted">{when(receipt.posted_at_sec)}</Row>
      {market.status === 'receipt_posted' && <Row label="Challenge window closes">{when(closesAt)}</Row>}
      <Row label="Source snapshot">
        {evidence ? <Outbound href={evidence}>{evidence}</Outbound> : receipt.evidence.uri}
      </Row>
      <Row label="Snapshot hash">
        <span className="font-mono text-[11px]">{receipt.evidence.hash}</span>
      </Row>
      {receipt.evidence.ai && (
        <>
          <Row label="Read by">{receipt.evidence.ai.model}</Row>
          <Row label="NEAR AI signer">
            <span className="font-mono text-[11px]">{receipt.evidence.ai.signing_address}</span>
          </Row>
        </>
      )}
      {challenge && (
        <>
          <Row label="Challenged by">
            {challenge.challenger} on {when(challenge.at_sec)}
          </Row>
          <Row label="Their reason">{challenge.reason_uri}</Row>
          {market.status === 'challenged' && (
            <p data-testid="market-under-review" className="text-[12px] text-warning">
              The arbiter is reviewing this challenge.
            </p>
          )}
        </>
      )}
      {market.status === 'receipt_posted' && nowSec() < closesAt && <ChallengeForm market={market} />}
    </section>
  );
}

/** Where the market came from, what it locked, and how its result was reached. */
export function NearMarketProof({ marketId }: { marketId: string }) {
  const { data: market } = useQuery({
    queryKey: ['near', 'market-proof', marketId],
    queryFn: () => getNearMarket(marketId),
    refetchInterval: 15_000,
  });
  if (!market) return null;
  return (
    <div className="max-lg:order-3 overflow-hidden rounded-[10px] border border-border bg-card">
      <SourcePost market={market} />
      <LockedRules market={market} />
      <Receipt market={market} />
    </div>
  );
}
