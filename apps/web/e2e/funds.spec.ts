import { expect, test } from '@playwright/test';
import { usdcBalance, USDC, type FunctionCall } from './helpers/near';
import { injectWallet } from './helpers/wallet';

const ACCOUNT = 'predit-markets-alice.testnet';

test.describe('balance, deposit and withdraw', () => {
  // What the test wallet was asked to sign; it refuses everything.
  let calls: FunctionCall[];
  test.beforeEach(async ({ page }) => {
    calls = await injectWallet(page, ACCOUNT);
  });

  test('the balance has its own pill, apart from the account', async ({ page }) => {
    const balance = Number(await usdcBalance(ACCOUNT)) / 1e6;
    await page.goto('/markets');
    await expect(page.getByTestId('balance-pill')).toContainText('tUSDC');
    await expect(page.getByTestId('balance-pill')).toContainText(balance.toLocaleString('en-US', { maximumFractionDigits: 2 }));
    await expect(page.getByTestId('near-account')).toContainText(ACCOUNT.slice(0, 12));
    await expect(page.getByTestId('near-account')).not.toContainText('tUSDC');
    await page.getByTestId('balance-pill').click();
    await expect(page.getByTestId('balance-menu')).toBeVisible();
    await expect(page.getByTestId('balance-deposit')).toBeVisible();
    await expect(page.getByTestId('balance-withdraw')).toBeVisible();
  });

  test('deposit opens as a dialog with the NEAR address, the faucet and other chains', async ({ page }) => {
    await page.goto('/markets');
    await page.getByTestId('balance-pill').click();
    await page.getByTestId('balance-deposit').click();
    const dialog = page.getByTestId('deposit-dialog');
    await expect(dialog.getByTestId('deposit-usdc-balance')).toHaveText(/^\d/);
    await expect(dialog.getByTestId('deposit-faucet')).toBeVisible();
    await expect(dialog.getByText(ACCOUNT).first()).toBeVisible();
    await dialog.getByRole('tab', { name: 'Other chains' }).or(dialog.getByRole('button', { name: 'Other chains' })).first().click();
    await dialog.getByTestId('deposit-chain-arbitrum').click();
    await dialog.getByTestId('simulate-amount').fill('50');
    await expect(dialog.getByTestId('simulate-deposit')).toHaveText('Deposit 50 USDC from Arbitrum');
    await expect(dialog.getByText(ACCOUNT).first()).toBeVisible();
  });

  test('withdraw sends tUSDC to a NEAR account', async ({ page }) => {
    await page.goto('/portfolio');
    await page.getByTestId('portfolio-send').click();
    const dialog = page.getByTestId('withdraw-dialog');
    await dialog.getByTestId('withdraw-to').fill('not a valid account!');
    await dialog.getByTestId('withdraw-amount').fill('1');
    await expect(dialog.getByTestId('withdraw-problem')).toBeVisible();
    await expect(dialog.getByTestId('withdraw-send')).toBeDisabled();

    // Already holds tUSDC: one transfer.
    await dialog.getByTestId('withdraw-to').fill('predit-markets-bob.testnet');
    await dialog.getByTestId('withdraw-send').click();
    await expect.poll(() => calls.length).toBe(1);
    expect(calls[0]).toMatchObject({ receiverId: USDC, methodName: 'ft_transfer', deposit: '1' });
    expect(calls[0].args).toMatchObject({ receiver_id: 'predit-markets-bob.testnet', amount: '1000000' });
    // The test wallet refused: the dialog says so and nothing left the wallet.
    await expect(dialog.getByTestId('withdraw-error')).toBeVisible();
  });

  test('withdraw registers a new receiver with the token in the same transaction', async ({ page }) => {
    await page.goto('/markets');
    await page.getByTestId('balance-pill').click();
    await page.getByTestId('balance-withdraw').click();
    const dialog = page.getByTestId('withdraw-dialog');
    await dialog.getByTestId('withdraw-to').fill('predit-markets-arbiter.testnet');
    await dialog.getByTestId('withdraw-amount').fill('2.5');
    await dialog.getByTestId('withdraw-send').click();
    await expect.poll(() => calls.length).toBe(2);
    expect(calls[0]).toMatchObject({ receiverId: USDC, methodName: 'storage_deposit' });
    expect(calls[0].args).toEqual({ account_id: 'predit-markets-arbiter.testnet', registration_only: true });
    expect(calls[1].args).toMatchObject({ receiver_id: 'predit-markets-arbiter.testnet', amount: '2500000' });
  });

  test('a withdrawal to another chain is a labelled simulation', async ({ page }) => {
    await page.goto('/markets');
    await page.getByTestId('balance-pill').click();
    await page.getByTestId('balance-withdraw').click();
    const dialog = page.getByTestId('withdraw-dialog');
    await dialog.getByRole('tab', { name: 'Other chains' }).or(dialog.getByRole('button', { name: 'Other chains' })).first().click();
    await expect(dialog.getByTestId('withdraw-simulation-label')).toContainText('Testnet simulation');
    await dialog.getByTestId('withdraw-address').fill('0x1234');
    await dialog.getByTestId('withdraw-amount').fill('1');
    await expect(dialog.getByTestId('withdraw-simulate')).toBeDisabled();
    await dialog.getByTestId('withdraw-address').fill(`0x${'ab'.repeat(20)}`);
    await dialog.getByTestId('withdraw-simulate').click();
    await expect.poll(() => calls.length).toBeGreaterThan(0);
    const transfer = calls.find((c) => c.methodName === 'ft_transfer')!;
    expect(transfer.args).toMatchObject({ receiver_id: USDC, amount: '1000000', memo: `Simulated withdrawal to base:0x${'ab'.repeat(20)}` });
    await expect(dialog.getByTestId('withdraw-status')).toContainText('FAILED');
  });

  test('the old deposit page is gone', async ({ page }) => {
    const res = await page.goto('/deposit');
    expect(res?.status()).toBe(404);
    await expect(page.getByTestId('not-found')).toBeVisible();
  });
});
