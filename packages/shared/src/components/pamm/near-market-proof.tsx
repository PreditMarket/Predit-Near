'use client';

import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';

import { getNearMarket } from '@/lib/near/contract';
import { outcomeLabel, postUrl, safeHttpUrl } from '@/lib/near/map';
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
  return (
    <section className="flex flex-col gap-2 px-[18px] py-4" data-testid="market-source-post">
      <div className={LABEL}>Created from this post</div>
      <p className="whitespace-pre-wrap break-words text-[13px] text-foreground">{market.post.text}</p>
      <div className="flex flex-wrap items-center gap-3 text-[11.5px] text-muted-foreground">
        <span>{market.post.author_ref}</span>
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
        <Row label="Challenged by">
          {challenge.challenger} on {when(challenge.at_sec)}
        </Row>
      )}
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
