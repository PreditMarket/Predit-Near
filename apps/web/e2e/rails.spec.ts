import { expect, test, type Page } from '@playwright/test';
import { POSTS, stubFeed } from './helpers/feed';
import { allMarkets, isTradable } from './helpers/near';
import { injectWallet } from './helpers/wallet';

const ALICE = 'predit-markets-alice.testnet';
const SIGNER = '0xfe0071895500a9755c18044948ab4f4e1a7f337e';

/** NEAR AI answered by the test: one market card, one post card. */
async function stubChat(page: Page, marketId: string, asked: unknown[]) {
  await page.route('**/api/chat/signature**', (route) => route.fulfill({ json: { signer: SIGNER, kind: 'provider_tee' } }));
  await page.route('**/api/chat', (route) => {
    asked.push(route.request().postDataJSON());
    return route.fulfill({
      json: {
        answer: `Soonest: [[market:${marketId}]]\n\nNo market yet: [[post:${POSTS[3].id}]]`,
        chatId: 'chatcmpl-e2e',
        model: 'deepseek-ai/DeepSeek-V4.1-Flash-1017',
      },
    });
  });
}

test.describe('home rails', () => {
  test.beforeEach(async ({ page }) => {
    await stubFeed(page);
  });

  test('the Markets rail lists open markets and a tap opens a bet', async ({ page }) => {
    const calls = await injectWallet(page, ALICE);
    const open = (await allMarkets()).filter(isTradable);
    test.skip(open.length === 0, 'no open market on the demo contract');
    await page.goto('/');
    const rail = page.getByTestId('left-rail');
    await expect(rail.getByTestId('rail-market').first()).toBeVisible();
    await rail.getByTestId('rail-tab-new').click();
    const newest = open.sort((a, b) => Number(b.id) - Number(a.id))[0];
    await expect(rail.getByTestId('rail-market').first()).toHaveAttribute('data-market', newest.id);
    await rail.getByTestId('rail-market').first().click();
    await expect(page.getByTestId('amount-input').first()).toHaveValue('5');
    await page.getByTestId('submit-trade-btn').first().click();
    await expect.poll(() => calls.length).toBeGreaterThan(0);
  });

  test('both rails fold to a strip and stay folded after a reload', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Collapse Markets' }).click();
    await page.getByRole('button', { name: 'Collapse NEAR AI' }).click();
    await expect(page.getByTestId('left-rail')).toHaveCount(0);
    await expect(page.getByTestId('right-rail')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('article').first()).toBeVisible();
    await expect(page.getByTestId('left-rail')).toHaveCount(0);
    await expect(page.getByTestId('right-rail')).toHaveCount(0);
  });

  test('NEAR AI asks for a wallet first', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('right-rail').getByTestId('ai-connect')).toBeVisible();
    await expect(page.getByTestId('ai-suggestion').first()).toBeDisabled();
  });

  test('NEAR AI answers with cards to bet on and to create from, signed', async ({ page }) => {
    await injectWallet(page, ALICE);
    const open = (await allMarkets()).filter(isTradable);
    test.skip(open.length === 0, 'no open market on the demo contract');
    const asked: unknown[] = [];
    await stubChat(page, open[0].id, asked);
    await page.goto('/');
    const rail = page.getByTestId('right-rail');
    await rail.getByTestId('ai-input').fill('Which markets close soonest?');
    await rail.getByTestId('ai-send').click();

    await expect(rail.getByTestId('ai-question')).toHaveText('Which markets close soonest?');
    await expect(rail.getByTestId('ai-market-chip')).toContainText(open[0].rules.question);
    await expect(rail.getByTestId('ai-post-chip')).toContainText(POSTS[3].content);
    await expect(rail.getByTestId('ai-signed')).toContainText('0xfe00');
    expect(asked[0]).toMatchObject({ accountId: ALICE, messages: [{ role: 'user', content: 'Which markets close soonest?' }] });

    await rail.getByTestId('ai-market-chip').click();
    await expect(page.getByTestId('amount-input').first()).toHaveValue('5');
    await page.keyboard.press('Escape');

    // The chat is kept for this account in this browser.
    await page.reload();
    await expect(rail.getByTestId('ai-answer')).toHaveCount(1);
    await rail.getByTestId('ai-new-chat').click();
    await expect(rail.getByTestId('ai-answer')).toHaveCount(0);
  });

  test('NEAR AI says so when the day is used up', async ({ page }) => {
    await injectWallet(page, ALICE);
    await page.route('**/api/chat', (route) =>
      route.fulfill({ status: 429, json: { error: 'That is all the questions for today. NEAR AI credit is limited on this testnet.' } }),
    );
    await page.goto('/');
    await page.getByTestId('ai-suggestion').first().click();
    await expect(page.getByTestId('ai-error')).toContainText('all the questions for today');
  });
});
