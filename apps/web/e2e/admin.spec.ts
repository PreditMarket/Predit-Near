import { expect, test } from '@playwright/test';
import { injectWallet } from './helpers/wallet';

test.describe('result confirmation', () => {
  test('is read-only for an account that is not an admin', async ({ page }) => {
    await injectWallet(page, 'predit-markets-bob.testnet');
    await page.route('**/api/admin/pending', (route) => route.fulfill({ json: { admins: ['someone-else.testnet'], items: [] } }));
    await page.goto('/admin/resolve');
    await expect(page.getByTestId('resolve-not-admin')).toBeVisible();
    await expect(page.getByTestId('resolve-empty')).toBeVisible();
    await expect(page.getByTestId('resolve-confirm')).toHaveCount(0);
  });

  test('refuses a decision nobody signed', async ({ request }) => {
    const message = JSON.stringify({ app: 'predit-admin', marketId: '1', outcome: 'yes', invalidKind: null, reason: 'x', issuedAt: Date.now() });
    const nonce = Buffer.alloc(32, 1).toString('base64');
    const missing = await request.post('/api/admin/confirm', { data: { message } });
    expect(missing.status()).toBe(400);
    const stale = await request.post('/api/admin/confirm', {
      data: { message: message.replace(/"issuedAt":\d+/, '"issuedAt":1'), nonce, accountId: 'a.testnet', publicKey: 'ed25519:11111111111111111111111111111111', signature: 'AA==' },
    });
    expect(stale.status()).toBe(401);
    const stranger = await request.post('/api/admin/confirm', {
      data: { message, nonce, accountId: 'not-an-admin-e2e.testnet', publicKey: 'ed25519:11111111111111111111111111111111', signature: 'AA==' },
    });
    expect(stranger.status()).toBe(403);
  });
});
