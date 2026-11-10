import { expect, test } from '@playwright/test';
import { allMarkets, isTradable } from './helpers/near';

test.describe('markets list', () => {
  test('lists the open markets with their own outcome labels', async ({ page }) => {
    const open = (await allMarkets()).filter(isTradable);
    await page.goto('/markets');
    for (const market of open) {
      const card = page.locator(`[data-testid=market-card][data-market="${market.id}"]`);
      await expect(card).toContainText(market.rules.question);
      await expect(card.getByTestId('market-card-yes')).toContainText(market.rules.yes_label);
      await expect(card.getByTestId('market-card-no')).toContainText(market.rules.no_label);
    }
  });

  test('moves settled markets to their own tab', async ({ page }) => {
    const settled = (await allMarkets()).filter((m) => m.status === 'finalized' || m.status === 'cancelled');
    await page.goto('/markets');
    await page.getByTestId('markets-tab-settled').click();
    await expect(page.getByTestId('market-card')).toHaveCount(settled.length);
    await expect(page.getByTestId('market-card-yes')).toHaveCount(0);
  });

  test('searches by question', async ({ page }) => {
    const [first] = (await allMarkets()).filter(isTradable);
    await page.goto('/markets');
    await page.getByTestId('markets-search').fill(first.rules.question.slice(5, 25));
    await expect(page.locator(`[data-testid=market-card][data-market="${first.id}"]`)).toBeVisible();
    await page.getByTestId('markets-search').fill('no market asks this zzz');
    await expect(page.getByTestId('markets-empty')).toBeVisible();
  });

  test('filters by category from the URL', async ({ page }) => {
    await page.goto('/markets?category=sports');
    await page.getByTestId('markets-tab-all').click();
    const sports = (await allMarkets()).filter((m) => (m as unknown as { rules: { category: string } }).rules.category === 'sports');
    await expect(page.getByTestId('market-card')).toHaveCount(sports.length);
  });
});
