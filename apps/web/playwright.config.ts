import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests for the NEAR build.
 *
 *   pnpm build && pnpm test:e2e          No keys. Reads the testnet contract,
 *                                        signs nothing: the test wallet hands
 *                                        each transaction back to the test.
 *   pnpm test:e2e:testnet                Also signs real testnet transactions
 *                                        with keys from ~/.near-credentials.
 *
 * E2E_BASE_URL points the suite at a running server instead of starting one.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
const TESTNET = process.env.NEAR_E2E_TESTNET === '1';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 30_000 },
  // One worker: the specs share testnet accounts and a public RPC.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 950 },
  },
  projects: [
    { name: 'near', testIgnore: /testnet\// },
    ...(TESTNET ? [{ name: 'testnet', testMatch: /testnet\/.*\.spec\.ts/ }] : []),
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm exec next start -p ${PORT}`,
        url: `${BASE_URL}/api/version`,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
