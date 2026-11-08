import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  globalSetup: require.resolve('./global-setup.js'),
  testDir: './playwright/specs',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // serial — wallet state is shared
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright/report', open: 'never' }],
  ],
  use: {
    baseURL,
    headless: true,
    viewport: { width: 1280, height: 720 },
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    trace: 'on-first-retry',
  },
  outputDir: 'playwright/test-results',
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
