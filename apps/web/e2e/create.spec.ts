import { expect, test } from '@playwright/test';
import { DRAFT, stubFeed } from './helpers/feed';
import { allMarkets, isTradable, MARKET, view } from './helpers/near';
import { injectWallet } from './helpers/wallet';

const ACCOUNT = 'predit-markets-alice.testnet';

test.describe('create a market without leaving the feed', () => {
  test('NEAR AI drafts it in a dialog and one transaction locks it', async ({ page }) => {
    await stubFeed(page);
    const calls = await injectWallet(page, ACCOUNT);
    await page.goto('/');
    await page.locator('article', { hasText: 'NEAR TVL on DefiLlama' }).getByTestId('post-create-market').click();
    const dialog = page.getByTestId('create-market-dialog');
    await expect(dialog.getByTestId('create-source-post')).toContainText('NEAR TVL on DefiLlama');
    await expect(dialog.getByTestId('create-ai-note')).toContainText('Drafted by NEAR AI');
    await expect(dialog.getByTestId('create-question')).toHaveValue(DRAFT.draft.question);
    await expect(dialog.getByTestId('create-yes-condition')).toHaveValue(DRAFT.draft.yesCondition);
    await expect(dialog.getByTestId('create-source-open')).toHaveAttribute('href', DRAFT.draft.source);
    expect(new URL(page.url()).pathname).toBe('/');

    test.skip(await dialog.getByTestId('create-short-of-near').isVisible(), `${ACCOUNT} lacks the NEAR for the bond`);
    await dialog.getByTestId('create-question').fill('Will NEAR TVL double by May 2027 (e2e)?');
    await dialog.getByTestId('create-submit').click();
    await expect.poll(() => calls.length).toBe(1);
    const call = calls[0];
    expect(call).toMatchObject({ receiverId: MARKET, methodName: 'create_market' });
    expect(call.args.post).toMatchObject({ post_id: 'sample-near-tvl', source: 'sample', author_ref: 'sample:sample_chains' });
    expect(call.args.rules).toMatchObject({ question: 'Will NEAR TVL double by May 2027 (e2e)?', resolution_source: DRAFT.draft.source });
    expect(typeof (call.args.rules as { expiry_sec: unknown }).expiry_sec).toBe('string');
    expect(call.args.draft).toEqual({ model: DRAFT.model, chat_id: DRAFT.chatId });
    // The bond (0 on the demo deployment) plus the storage margin; the contract refunds what it does not use.
    const { creation_bond } = await view<{ creation_bond: string }>(MARKET, 'get_config');
    expect(BigInt(call.deposit)).toBe(BigInt(creation_bond) + BigInt('100000000000000000000000'));
    // The wallet refused: the dialog says so and can send again.
    await expect(dialog.getByTestId('create-error')).toBeVisible();
    await expect(dialog.getByTestId('create-submit')).toBeEnabled();
  });

  test('once created, a prediction can be placed on the market straight away', async ({ page }) => {
    const open = (await allMarkets()).find(isTradable);
    test.skip(!open, 'no open market to stand in for the new one');
    await stubFeed(page);
    // The contract returns the new market's id; an existing open market stands in for it.
    await injectWallet(page, ACCOUNT, {
      answer: () => ({ status: { SuccessValue: Buffer.from(JSON.stringify(open!.id)).toString('base64') }, transaction: { hash: 'e2e' } }),
    });
    await page.goto('/');
    await page.locator('article', { hasText: 'NEAR TVL on DefiLlama' }).getByTestId('post-create-market').click();
    const dialog = page.getByTestId('create-market-dialog');
    await expect(dialog.getByTestId('create-ai-note')).toContainText('Drafted by NEAR AI');
    test.skip(await dialog.getByTestId('create-short-of-near').isVisible(), `${ACCOUNT} lacks the NEAR for the bond`);
    await dialog.getByTestId('create-submit').click();
    await expect(dialog.getByTestId('created-primary')).toHaveText('Place a prediction');
    await dialog.getByTestId('created-primary').click();
    await expect(page.getByTestId('amount-input').first()).toHaveValue('5');
    await expect(page.getByTestId('submit-trade-btn').first()).toBeEnabled();
    expect(new URL(page.url()).pathname).toBe('/');
  });

  test('the nav button opens a picker, predictions first', async ({ page }) => {
    await stubFeed(page);
    await injectWallet(page, ACCOUNT);
    await page.goto('/');
    await page.getByRole('button', { name: 'Create market' }).first().click();
    const dialog = page.getByTestId('create-market-dialog');
    await expect(dialog.getByTestId('create-picker')).toBeVisible();
    await expect(dialog.getByTestId('create-pick').first()).toHaveAttribute('data-post', 'sample-near-tvl');
    await dialog.locator('[data-testid=create-pick][data-post="sample-gm"]').click();
    await expect(dialog.getByTestId('create-source-post')).toContainText('Quiet day on chain');
    await dialog.getByRole('button', { name: 'Pick another post' }).click();
    await expect(dialog.getByTestId('create-picker')).toBeVisible();
  });

  test('falls back to a hand-filled form when NEAR AI cannot draft', async ({ page }) => {
    await stubFeed(page, { draft: 'fail' });
    await injectWallet(page, ACCOUNT);
    await page.goto('/');
    await page.locator('article', { hasText: 'Quiet day on chain' }).getByTestId('post-create-market').click();
    const dialog = page.getByTestId('create-market-dialog');
    await expect(dialog.getByTestId('create-ai-note')).toContainText('could not draft');
    await expect(dialog.getByTestId('create-submit')).toBeDisabled();
    await dialog.getByTestId('create-yes-condition').fill('Y');
    await dialog.getByTestId('create-no-condition').fill('N');
    await dialog.getByTestId('create-source').fill('https://example.com/source');
    await expect(dialog.getByTestId('create-problem')).toHaveCount(0);
  });

  test('the old create page is gone', async ({ page }) => {
    // Streamed under the app's loading screen, so the status is already sent: the page says it instead.
    await page.goto('/market/create?post=sample-gm');
    await expect(page.getByTestId('not-found')).toBeVisible();
  });
});
