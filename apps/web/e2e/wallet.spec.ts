import { expect, test } from '@playwright/test';
import { injectWallet } from './helpers/wallet';

const ACCOUNT = 'predit-markets-alice.testnet';

test('connects through the wallet selector, survives a reload and disconnects', async ({ page }) => {
  await injectWallet(page, ACCOUNT, { connected: false });
  await page.goto('/portfolio');
  await page.getByTestId('near-connect').click();
  await page.locator('.connect-item[data-type="e2e-wallet"]').click();
  await expect(page.getByTestId('near-account')).toContainText(ACCOUNT.slice(0, 12));
  await expect(page.getByTestId('near-account')).toContainText('tUSDC');

  await page.reload();
  await expect(page.getByTestId('near-account')).toBeVisible();
  await expect(page.getByTestId('portfolio-identity')).toContainText(ACCOUNT);

  await page.getByTestId('near-account').click();
  await page.getByRole('menuitem', { name: 'Disconnect' }).click();
  await expect(page.getByTestId('near-connect')).toBeVisible();
});
