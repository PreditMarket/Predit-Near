import type { PostDto } from '@/services/feed.service';

const HOUR = 3_600_000;

/** Invented accounts, so no real person is shown saying any of this. */
const SAMPLES: { id: string; name: string; handle: string; hoursAgo: number; content: string }[] = [
  { id: 'sample-btc-q1', name: 'Sample Macro Desk', handle: 'sample_macro', hoursAgo: 1, content: 'BTC closes above $150k on CoinGecko before the end of Q1 2027. Writing this down so you can hold me to it.' },
  { id: 'sample-near-tvl', name: 'Sample Chain Watcher', handle: 'sample_chains', hoursAgo: 3, content: 'NEAR TVL on DefiLlama doubles within six months. Intents volume is the part people are still sleeping on.' },
  { id: 'sample-eth-flip', name: 'Sample Macro Desk', handle: 'sample_macro', hoursAgo: 6, content: 'ETH will not make a new all-time high before July 2027. Sell me your conviction.' },
  { id: 'sample-fed-cut', name: 'Sample Rates Note', handle: 'sample_rates', hoursAgo: 11, content: 'The Fed cuts rates at its next meeting. The statement on federalreserve.gov will settle this one.' },
  { id: 'sample-ai-model', name: 'Sample AI Notes', handle: 'sample_ai', hoursAgo: 20, content: 'An open-weights model tops the LMArena text leaderboard before June 2027.' },
  { id: 'sample-gm', name: 'Sample Chain Watcher', handle: 'sample_chains', hoursAgo: 26, content: 'Quiet day on chain. Good day to read a whitepaper.' },
];

/** The feed when no key is set or X cannot be reached. Clearly sample data. */
export function samplePosts(): PostDto[] {
  const now = Date.now();
  return SAMPLES.map((s) => ({
    id: s.id,
    content: s.content,
    createdAt: new Date(now - s.hoursAgo * HOUR).toISOString(),
    author: { id: `sample:${s.handle}`, username: s.name, displayName: s.name, handle: s.handle, avatar: null },
    media: [],
    source: 'sample',
    externalUrl: null,
  }));
}
