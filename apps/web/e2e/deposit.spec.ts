import { expect, test } from '@playwright/test';
import { injectWallet } from './helpers/wallet';

test('deposit shows the NEAR address, the faucet and the labelled simulation', async ({ page }) => {
  await injectWallet(page, 'predit-markets-alice.testnet');
  await page.goto('/deposit');
  await expect(page.getByTestId('deposit-usdc-balance')).toHaveText(/^\d/);
  await expect(page.getByTestId('deposit-faucet')).toBeVisible();
  await expect(page.getByText('predit-markets-alice.testnet').first()).toBeVisible();
  await page.getByRole('button', { name: 'Other chains' }).or(page.getByRole('tab', { name: 'Other chains' })).first().click();
  await expect(page.getByTestId('testnet-simulation-label')).toBeVisible();
  await expect(page.getByTestId('simulate-deposit')).toBeVisible();
});
