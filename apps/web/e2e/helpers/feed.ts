import type { Page } from '@playwright/test';

const HOUR = 3_600_000;

const author = (handle: string, name: string) => ({
  id: `sample:${handle}`,
  username: name,
  displayName: name,
  handle,
  avatar: null,
});

/**
 * Posts whose ids have markets on the demo contract (see the app's sample
 * feed), plus two that have none. The feed is stubbed so the specs do not
 * depend on an X key or on what accounts tweeted today.
 */
export const POSTS = [
  { id: 'sample-btc-q1', content: 'BTC closes above $150k on CoinGecko before the end of Q1 2027.', handle: 'sample_macro', name: 'Sample Macro Desk', hoursAgo: 1 },
  { id: 'sample-near-tvl', content: 'NEAR TVL on DefiLlama doubles within six months.', handle: 'sample_chains', name: 'Sample Chain Watcher', hoursAgo: 3 },
  { id: 'sample-fed-cut', content: 'The Fed cuts rates at its next meeting.', handle: 'sample_rates', name: 'Sample Rates Note', hoursAgo: 11 },
  { id: 'sample-gm', content: 'Quiet day on chain. Good day to read a whitepaper.', handle: 'sample_chains', name: 'Sample Chain Watcher', hoursAgo: 26 },
].map((p) => ({
  id: p.id,
  content: p.content,
  createdAt: new Date(Date.now() - p.hoursAgo * HOUR).toISOString(),
  author: author(p.handle, p.name),
  media: [],
  source: 'sample',
  externalUrl: null,
}));

export const DETECTED = { 'sample-near-tvl': 'NEAR TVL on DefiLlama doubles within six months.' };

export const DRAFT = {
  model: 'deepseek-ai/DeepSeek-V4.1-Flash-1017',
  chatId: 'chatcmpl-e2e',
  draft: {
    question: 'Will NEAR TVL on DefiLlama double by May 2027?',
    description: 'The post expects NEAR TVL to double within six months.',
    yesLabel: 'Yes',
    noLabel: 'No',
    yesCondition: 'DefiLlama shows NEAR TVL at least twice the November 2026 value on the deadline.',
    noCondition: 'DefiLlama shows NEAR TVL below twice the November 2026 value on the deadline.',
    invalidConditions: 'DefiLlama is unreachable at the deadline.',
    source: 'https://defillama.com/chain/near',
    deadlineMs: Date.parse('2027-05-10T00:00:00Z'),
    category: 'crypto',
    claimSide: 'yes',
  },
};

/** The app's own feed and AI routes, answered by the test. */
export async function stubFeed(page: Page, { draft = 'ok' as 'ok' | 'fail' } = {}) {
  await page.route('**/api/feed**', async (route) => {
    const url = new URL(route.request().url());
    const id = url.searchParams.get('id');
    if (id) {
      const post = POSTS.find((p) => p.id === id);
      return route.fulfill(post ? { json: { post } } : { status: 404, json: { error: 'Not found' } });
    }
    return route.fulfill({ json: { items: POSTS, nextCursor: null, sample: true } });
  });
  await page.route('**/api/detect**', (route) => route.fulfill({ json: { detected: DETECTED } }));
  await page.route('**/api/draft**', (route) =>
    draft === 'ok' ? route.fulfill({ json: DRAFT }) : route.fulfill({ status: 502, json: { error: 'NEAR AI could not draft this post' } }),
  );
}
