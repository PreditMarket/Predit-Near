import { expect, test } from '@playwright/test';
import { DRAFT, stubFeed } from './helpers/feed';
import { MARKET } from './helpers/near';
import { injectWallet } from './helpers/wallet';

const ACCOUNT = 'predit-markets-alice.testnet';

test.describe('create a market from a post', () => {
  test('NEAR AI drafts the market and one transaction locks it', async ({ page }) => {
    await stubFeed(page);
    const calls = await injectWallet(page, ACCOUNT);
    await page.goto('/');
    await page.locator('article', { hasText: 'NEAR TVL on DefiLlama' }).getByTestId('post-create-market').click();
    await expect(page.getByTestId('create-source-post')).toContainText('NEAR TVL on DefiLlama');
    await expect(page.getByTestId('create-ai-note')).toContainText('Drafted by NEAR AI');
    await expect(page.getByTestId('create-question')).toHaveValue(DRAFT.draft.question);
    await expect(page.getByTestId('create-source')).toHaveValue(DRAFT.draft.source);
    await expect(page.getByTestId('create-source-open')).toHaveAttribute('href', DRAFT.draft.source);

    const submit = page.getByTestId('create-submit');
    test.skip(await page.getByTestId('create-short-of-near').isVisible(), `${ACCOUNT} lacks the NEAR for the bond`);
    await page.getByTestId('create-question').fill('Will NEAR TVL double by May 2027 (e2e)?');
    await submit.click();
    await expect.poll(() => calls.length).toBe(1);
    const call = calls[0];
    expect(call).toMatchObject({ receiverId: MARKET, methodName: 'create_market' });
    expect(call.args.post).toMatchObject({ post_id: 'sample-near-tvl', source: 'sample', author_ref: 'sample:sample_chains' });
    expect(call.args.rules).toMatchObject({
      question: 'Will NEAR TVL double by May 2027 (e2e)?',
      resolution_source: DRAFT.draft.source,
      yes_condition: DRAFT.draft.yesCondition,
    });
    expect(typeof (call.args.rules as { expiry_sec: unknown }).expiry_sec).toBe('string');
    expect(call.args.draft).toEqual({ model: DRAFT.model, chat_id: DRAFT.chatId });
    // The bond plus the storage margin; the contract refunds what it does not use.
    expect(BigInt(call.deposit)).toBe(BigInt('1100000000000000000000000'));
    // The wallet refused: the form says so and can be sent again.
    await expect(page.getByTestId('create-error')).toBeVisible();
    await expect(submit).toBeEnabled();
  });

  test('falls back to a hand-filled form when NEAR AI cannot draft', async ({ page }) => {
    await stubFeed(page, { draft: 'fail' });
    await injectWallet(page, ACCOUNT);
    await page.goto('/market/create?post=sample-gm');
    await expect(page.getByTestId('create-ai-note')).toContainText('could not draft');
    await expect(page.getByTestId('create-submit')).toBeDisabled();
    await page.getByTestId('create-yes-condition').fill('Y');
    await page.getByTestId('create-no-condition').fill('N');
    await page.getByTestId('create-source').fill('https://example.com/source');
    await expect(page.getByTestId('create-problem')).toHaveCount(0);
  });

  test('asks a signed-out visitor to connect a wallet', async ({ page }) => {
    await stubFeed(page);
    await page.goto('/market/create?post=sample-gm');
    await expect(page.getByText('Connect a NEAR wallet to create a market')).toBeVisible();
  });
});
