import { expect, test } from '@playwright/test';
import { allMarkets, isTradable, MARKET, view } from '../helpers/near';
import { injectWallet } from '../helpers/wallet';

// Signs real testnet transactions: run with `pnpm test:e2e:testnet`.
const ACCOUNT = process.env.NEAR_E2E_TRADER ?? 'predit-markets-alice.testnet';

interface Position {
  yes_shares: string;
  no_shares: string;
}

test('a prediction and its sale land on the contract', async ({ page }) => {
  const market = (await allMarkets()).find(isTradable);
  test.skip(!market, 'no open market');
  const position = () => view<Position>(MARKET, 'get_position', { market_id: market!.id, account_id: ACCOUNT });
  await injectWallet(page, ACCOUNT, { mode: 'live' });

  const before = await position();
  await page.goto(`/market/${market!.id}`);
  await page.getByTestId('amount-input').first().fill('1');
  await page.getByTestId('submit-trade-btn').first().click();
  await expect.poll(async () => BigInt((await position()).yes_shares), { timeout: 60_000 }).toBeGreaterThan(BigInt(before.yes_shares));

  const bought = await position();
  await page.reload();
  await page.locator('button', { hasText: /^sell$/i }).first().click();
  await page.getByTestId('amount-input').first().fill('1');
  await page.getByTestId('submit-trade-btn').first().click();
  await expect.poll(async () => BigInt((await position()).yes_shares), { timeout: 60_000 }).toBeLessThan(BigInt(bought.yes_shares));
});
