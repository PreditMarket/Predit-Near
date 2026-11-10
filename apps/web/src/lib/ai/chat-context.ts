import { loadPosts } from '@/lib/feed/posts';
import { getAllNearMarkets } from '@/lib/near/contract';
import { outcomeLabel, phaseLabel } from '@/lib/near/map';
import type { NearMarket } from '@/lib/near/types';

const POSTS = 20;
const SETTLED = 10;
const clip = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
};
const day = (sec: string | number) => new Date(Number(sec) * 1000).toISOString().slice(0, 16).replace('T', ' ');
const usdc = (raw: string) => (Number(raw) / 1e6).toFixed(2);

function marketLine(m: NearMarket): string {
  const parts = [
    `MARKET ${m.id}`,
    phaseLabel(m),
    `"${clip(m.rules.question, 160)}"`,
    `${m.rules.yes_label} ${(m.price_yes_bps / 100).toFixed(0)}% / ${m.rules.no_label} ${(100 - m.price_yes_bps / 100).toFixed(0)}%`,
    `${m.rules.yes_label} if: ${clip(m.rules.yes_condition, 160)}`,
    `deadline ${day(m.rules.expiry_sec)} UTC`,
    `source ${m.rules.resolution_source}`,
    `volume ${usdc(m.volume)} tUSDC, ${m.trades} trades`,
    `from post ${m.post.post_id} by ${m.post.author_ref}, who took ${m.claim_side === 'yes' ? m.rules.yes_label : m.rules.no_label}`,
  ];
  if (m.receipt) parts.push(`result ${outcomeLabel(m, m.receipt.outcome)}: ${clip(m.receipt.reason, 200)}`);
  return parts.join(' | ');
}

/** What NEAR AI may answer from: the markets on the contract and the feed's latest posts. */
export async function chatContext(): Promise<string> {
  const [markets, { posts }] = await Promise.all([getAllNearMarkets(), loadPosts()]);
  const live = markets.filter((m) => m.status !== 'finalized' && m.status !== 'cancelled');
  const settled = markets
    .filter((m) => m.status === 'finalized' || m.status === 'cancelled')
    .sort((a, b) => Number(b.id) - Number(a.id))
    .slice(0, SETTLED);
  const byPost = new Map<string, string[]>();
  for (const m of markets) byPost.set(m.post.post_id, [...(byPost.get(m.post.post_id) ?? []), m.id]);

  const postLines = posts.slice(0, POSTS).map((p) => {
    const ids = byPost.get(p.id);
    return `POST ${p.id} | @${p.author.handle} | ${p.createdAt.slice(0, 16).replace('T', ' ')} UTC | ${ids ? `markets ${ids.join(', ')}` : 'no market yet'} | ${clip(p.content, 240)}`;
  });

  return [
    `Now: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    'OPEN AND PENDING MARKETS',
    ...live.map(marketLine),
    'RECENTLY SETTLED MARKETS',
    ...settled.map(marketLine),
    'LATEST POSTS IN THE FEED',
    ...postLines,
  ].join('\n');
}
