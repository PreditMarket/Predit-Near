import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { MARKET, send, signerFor, USDC, view, type ChainMarket } from '../helpers/near';
import { injectWallet } from '../helpers/wallet';

/**
 * The whole result flow on testnet. Needs a server whose resolve agent runs:
 * NEAR_OPERATOR_ACCOUNT/KEY (the limited operator key), NEAR_AI_API_KEY and
 * NEAR_ADMIN_ACCOUNTS including NEAR_E2E_ADMIN. Point the suite at it with
 * E2E_BASE_URL. Bonds are returned once the markets settle.
 */
const ADMIN = process.env.NEAR_E2E_ADMIN ?? 'predit-markets-owner.testnet';
const CREATOR = process.env.NEAR_E2E_CREATOR ?? 'predit-markets-alice.testnet';
const TRADER = process.env.NEAR_E2E_TRADER ?? 'predit-markets-alice.testnet';
const CHALLENGER = process.env.NEAR_E2E_CHALLENGER ?? 'predit-markets-bob.testnet';
const ARBITER = process.env.NEAR_E2E_ARBITER ?? 'predit-markets-arbiter.testnet';
const SOURCE = 'https://en.wikipedia.org/wiki/Bitcoin';
const RUN = Date.now().toString(36);
const TGAS = '000000000000';

test.describe.configure({ mode: 'serial', timeout: 8 * 60_000 });

const market = (id: string) => view<ChainMarket & { challenge: unknown }>(MARKET, 'get_market', { market_id: id });

async function createMarket(tag: string, question: string, handle: string) {
  const postId = `e2e-resolve-${tag}-${RUN}`;
  const expiry = Math.floor(Date.now() / 1000) + 40;
  await send(await signerFor(CREATOR), {
    receiverId: MARKET,
    methodName: 'create_market',
    args: {
      post: { source: 'x', post_id: postId, author_ref: `x:${handle}`, text: `${question} (e2e post)` },
      claim_side: 'yes',
      rules: {
        question,
        description: 'Created by the e2e suite.',
        yes_label: 'Yes',
        no_label: 'No',
        yes_condition: 'The page describes Bitcoin as a cryptocurrency.',
        no_condition: 'It does not.',
        resolution_source: SOURCE,
        invalid_conditions: 'The page cannot be read.',
        category: 'crypto',
        image_url: '',
        expiry_sec: String(expiry),
      },
      draft: { model: 'e2e', chat_id: 'e2e' },
      challenge_window_sec: 60,
    },
    gas: `100${TGAS}`,
    deposit: '1100000000000000000000000',
  });
  const [[, markets]] = await view<[string, ChainMarket[]][]>(MARKET, 'get_markets_for_posts', { post_ids: [postId] });
  const id = markets[markets.length - 1].id;
  // Both sides, so the market is scored rather than refunded.
  for (const side of ['yes', 'no']) {
    await send(await signerFor(TRADER), {
      receiverId: USDC,
      methodName: 'ft_transfer_call',
      args: { receiver_id: MARKET, amount: '1000000', msg: JSON.stringify({ action: 'buy', market_id: id, side, min_shares: '0' }) },
      gas: `150${TGAS}`,
      deposit: '1',
    });
  }
  return { id, expiry };
}

async function waitForReading(page: Page, id: string) {
  await expect
    .poll(async () => (await (await page.request.get(`/api/evidence/${id}`)).json().catch(() => null))?.suggestion ?? null, {
      timeout: 4 * 60_000,
      intervals: [5_000],
    })
    .not.toBeNull();
}

/** The person decides: whatever NEAR AI suggested, they pick the outcome and say why. */
async function confirm(page: Page, id: string, choice: 'yes' | 'no') {
  await page.goto('/admin/resolve');
  const card = page.locator(`[data-testid=resolve-card][data-market="${id}"]`);
  await expect(card.getByTestId('resolve-suggestion')).toBeVisible({ timeout: 60_000 });
  await card.getByTestId('resolve-choice').selectOption(choice);
  await card.getByTestId('resolve-reason').fill(`Checked by the e2e suite: ${choice}.`);
  await card.getByTestId('resolve-confirm').click();
  await expect.poll(async () => (await market(id)).status, { timeout: 90_000 }).toBe('receipt_posted');
}

test.beforeAll(async ({ request }) => {
  const pending = await (await request.get('/api/admin/pending')).json();
  test.skip(!pending.admins?.includes(ADMIN), `the server under test does not list ${ADMIN} as an admin`);
});

test('NEAR AI reads the source, a person confirms, the agent settles it', async ({ page }) => {
  const handle = `e2e_${RUN}`;
  const { id, expiry } = await createMarket('yes', `Is Bitcoin a cryptocurrency (e2e ${RUN})?`, handle);
  await injectWallet(page, ADMIN, { mode: 'live' });
  await page.waitForTimeout(Math.max(0, expiry * 1000 - Date.now()) + 1_000);

  await waitForReading(page, id);
  const bundle = await (await page.request.get(`/api/evidence/${id}`)).json();
  expect(bundle.sourceUrl).toBe(SOURCE);
  expect(bundle.ai?.signature).toBeTruthy();

  await confirm(page, id, 'yes');
  const receipt = (await market(id)).receipt as unknown as { outcome: unknown; reason: string; evidence: { hash: string } };
  expect(receipt.outcome).toBe('yes');
  expect(receipt.reason).toBe('Checked by the e2e suite: yes.');
  expect(receipt.evidence.hash).toBe(bundle.snapshot.hash);

  const verify = execFileSync('node', [path.resolve(__dirname, '../../../../packages/shared/scripts/verify.mjs'), id], {
    encoding: 'utf8',
    env: { ...process.env, NEAR_MARKET_CONTRACT: MARKET },
  });
  expect(verify).not.toMatch(/^FAIL/m);

  await expect.poll(async () => (await market(id)).status, { timeout: 4 * 60_000, intervals: [5_000] }).toBe('finalized');
  // The author said yes and the market settled yes.
  const record = await view<{ correct: number; wrong: number }>(MARKET, 'get_record', { author_ref: `x:${handle}` });
  expect(record).toEqual({ correct: 1, wrong: 0 });
  await page.goto(`/u/@${handle}`);
  await expect(page.getByTestId('record-market')).toHaveCount(1);
});

test('a challenge from the market page goes to the arbiter', async ({ page, browser }) => {
  const { id, expiry } = await createMarket('challenge', `Is Bitcoin described on Wikipedia (e2e ${RUN})?`, `e2e_c_${RUN}`);
  await injectWallet(page, ADMIN, { mode: 'live' });
  await page.waitForTimeout(Math.max(0, expiry * 1000 - Date.now()) + 1_000);
  await waitForReading(page, id);
  await confirm(page, id, 'no');

  const challenger = await browser.newPage();
  await injectWallet(challenger, CHALLENGER, { mode: 'live' });
  await challenger.goto(`/market/${id}`);
  await challenger.getByTestId('challenge-reason').fill('The e2e suite disputes this result.');
  await challenger.getByTestId('challenge-submit').click();
  await expect(challenger.getByTestId('market-under-review')).toBeVisible({ timeout: 90_000 });
  const overturn = 'yes';
  await send(await signerFor(ARBITER), {
    receiverId: MARKET,
    methodName: 'arbitrate',
    args: { market_id: id, decision: { overturn } },
    gas: `150${TGAS}`,
    deposit: '0',
  });
  const settled = await market(id);
  expect(settled.status).toBe('finalized');
  expect(settled.outcome).toBe(overturn);
});
