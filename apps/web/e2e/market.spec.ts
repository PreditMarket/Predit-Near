import { expect, test } from '@playwright/test';
import { allMarkets, isTradable } from './helpers/near';
import { injectWallet } from './helpers/wallet';

test.describe('market page', () => {
  test('shows the source post, the locked rules and the receipt', async ({ page }) => {
    const settled = (await allMarkets()).find((m) => m.status === 'finalized' && m.receipt && m.post.author_ref.startsWith('x:'));
    test.skip(!settled, 'no settled market from an X post on this contract');
    await page.goto(`/market/${settled!.id}`);
    await expect(page.getByTestId('market-source-post')).toBeVisible();
    await expect(page.getByTestId('market-locked-rules')).toContainText(settled!.rules.resolution_source);
    await expect(page.getByTestId('market-receipt')).toContainText(settled!.receipt!.reason);
    await expect(page.getByTestId('market-receipt')).toContainText(settled!.receipt!.evidence.hash);
    const handle = settled!.post.author_ref.slice(2);
    await expect(page.getByTestId('market-author-record')).toHaveAttribute('href', `/u/@${handle}`);
    // The window is over once a market settles.
    await expect(page.getByTestId('market-challenge')).toHaveCount(0);
  });

  test('a prediction from the trade panel asks the wallet for a USDC transfer', async ({ page }) => {
    const market = (await allMarkets()).find(isTradable);
    test.skip(!market, 'no open market');
    const calls = await injectWallet(page, 'predit-markets-alice.testnet');
    await page.goto(`/market/${market!.id}`);
    await page.getByTestId('amount-input').first().fill('1');
    await page.getByTestId('submit-trade-btn').first().click();
    await expect.poll(() => calls.length).toBeGreaterThan(0);
    expect(calls[0].methodName).toBe('ft_transfer_call');
  });

  test('a market the contract does not have, or a name that is not an id, is not found', async ({ page }) => {
    for (const path of ['/market/not-a-number', '/market/999999']) {
      await page.goto(path);
      await expect(page.getByTestId('not-found')).toBeVisible();
    }
  });

  test('a settled market shows its result instead of prices', async ({ page }) => {
    await page.goto('/market/36');
    await expect(page.getByText('Result', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/YES price/i)).toHaveCount(0);
  });
});
