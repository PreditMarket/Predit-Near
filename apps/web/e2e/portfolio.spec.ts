import { expect, test } from '@playwright/test';
import { MARKET, view } from './helpers/near';
import { injectWallet } from './helpers/wallet';

const ACCOUNT = 'predit-markets-alice.testnet';

test('a claimed position stays in Settled with what it paid, and counts as right', async ({ page }) => {
  const claims = await view<[string, { kind: string; payout: string }][]>(MARKET, 'get_user_claims', { account_id: ACCOUNT });
  const redeemed = claims.filter(([, c]) => c.kind === 'redeem');
  test.skip(redeemed.length === 0, `${ACCOUNT} has not redeemed anything since claims were recorded`);

  await injectWallet(page, ACCOUNT);
  await page.goto('/portfolio');
  await page.getByTestId('portfolio-tabs').getByText('Settled').first().click();
  await expect(page.getByText('Claimed').first()).toBeVisible({ timeout: 30_000 });
  const payout = (Number(redeemed[0][1].payout) / 1e6).toFixed(2);
  await expect(page.getByText(new RegExp(`${payout}\\s*tUSDC`, 'i')).first()).toBeVisible();
  await expect(page.getByTestId('portfolio-win-rate')).toContainText(/\d+ right/);
});
