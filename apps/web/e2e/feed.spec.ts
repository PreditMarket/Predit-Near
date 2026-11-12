import { expect, test } from '@playwright/test';
import { DETECTED, POSTS, stubFeed } from './helpers/feed';
import { MARKET, view, type ChainMarket } from './helpers/near';
import { injectWallet } from './helpers/wallet';

const marketsFor = async (postId: string) => {
  const [[, markets]] = await view<[string, ChainMarket[]][]>(MARKET, 'get_markets_for_posts', { post_ids: [postId] });
  return markets;
};

test.describe('social feed', () => {
  test.beforeEach(async ({ page }) => {
    await stubFeed(page);
  });

  test('shows each post with the markets created from it', async ({ page }) => {
    const btc = await marketsFor('sample-btc-q1');
    await page.goto('/');
    const post = page.locator('article', { hasText: 'BTC closes above $150k' });
    await expect(post.getByTestId('post-market')).toHaveCount(btc.length);
    await expect(post.getByTestId('post-market').first()).toContainText(btc[0].rules.question);
    await expect(post.getByTestId('post-create-market')).toHaveCount(0);
    await expect(page.getByTestId('feed-sample-note')).toBeVisible();
  });

  test('offers Create market under a post with none', async ({ page }) => {
    await page.goto('/');
    const quiet = page.locator('article', { hasText: 'Quiet day on chain' });
    await expect(quiet.getByTestId('post-create-market')).toBeVisible();
    await expect(quiet.getByTestId('post-market')).toHaveCount(0);
  });

  test('marks the posts NEAR AI reads as predictions', async ({ page }) => {
    await page.goto('/');
    const tvl = page.locator('article', { hasText: 'NEAR TVL on DefiLlama' });
    await expect(tvl.getByTestId('post-prediction-detected')).toBeVisible();
    await expect(tvl.getByTestId('post-prediction-detected')).toHaveAttribute('title', DETECTED['sample-near-tvl']);
    await expect(page.locator('article', { hasText: 'Quiet day on chain' }).getByTestId('post-prediction-detected')).toHaveCount(0);
  });

  test('shows a settled market under its post with its receipt', async ({ page }) => {
    const [fed] = await marketsFor('sample-fed-cut');
    test.skip(fed?.status !== 'finalized', 'the demo market has not settled');
    await page.goto('/');
    const post = page.locator('article', { hasText: 'The Fed cuts rates' });
    await expect(post.getByTestId('post-market-resolved')).toContainText(/resolved/i);
    await expect(post.getByRole('link', { name: 'Receipt' })).toHaveAttribute('href', `/market/${fed.id}#receipt`);
  });

  test('tapping a question opens a prediction with the amount filled in', async ({ page }) => {
    const calls = await injectWallet(page, 'predit-markets-alice.testnet');
    const [btc] = await marketsFor('sample-btc-q1');
    test.skip(btc?.status !== 'open', 'the demo market is closed');
    await page.goto('/');
    await expect(page.getByTestId('near-account')).toBeVisible();
    const post = page.locator('article', { hasText: 'BTC closes above $150k' });
    await post.getByTestId('post-market-question').first().click();
    await expect(page.getByTestId('amount-input').first()).toHaveValue('5');
    await page.getByTestId('submit-trade-btn').first().click();
    await expect.poll(() => calls.length).toBeGreaterThan(0);
    expect(calls[0].args.amount).toBe('5000000');
    expect(new URL(page.url()).pathname).toBe('/');
    await expect(post.getByTestId('post-market-details').first()).toHaveAttribute('href', `/market/${btc.id}`);
  });

  test('predicting under a post asks the wallet for a USDC prediction', async ({ page }) => {
    const calls = await injectWallet(page, 'predit-markets-alice.testnet');
    const [btc] = await marketsFor('sample-btc-q1');
    await page.goto('/');
    await expect(page.getByTestId('near-account')).toBeVisible();
    await page.locator('article', { hasText: 'BTC closes above $150k' }).getByTestId('post-predict-yes').click();
    await page.getByTestId('amount-input').first().fill('1');
    await page.getByTestId('submit-trade-btn').first().click();
    await expect.poll(() => calls.length).toBeGreaterThan(0);
    const buy = calls[0];
    expect(buy.methodName).toBe('ft_transfer_call');
    expect(buy.args.receiver_id).toBe(MARKET);
    expect(buy.args.amount).toBe('1000000');
    expect(JSON.parse(buy.args.msg as string)).toMatchObject({ action: 'buy', market_id: btc.id, side: 'yes' });
  });

  test('older posts load on their own as the reader scrolls down', async ({ page }) => {
    // Two pages: the first two posts, then the rest.
    await page.route('**/api/feed**', (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('id')) return route.fallback();
      const second = url.searchParams.get('cursor') === '2';
      return route.fulfill({ json: { items: second ? POSTS.slice(2) : POSTS.slice(0, 2), nextCursor: second ? null : '2', sample: true } });
    });
    await page.goto('/');
    // A short first page sits within reach of the end already, so no click is needed.
    await page.locator('article').first().waitFor();
    await page.getByTestId('feed-sentinel').scrollIntoViewIfNeeded();
    await expect(page.locator('article')).toHaveCount(POSTS.length);
    await expect(page.getByRole('button', { name: 'Load more' })).toHaveCount(0);
  });
});
