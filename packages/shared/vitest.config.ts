import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = fileURLToPath(new URL('./src', import.meta.url));

// Unit tests for pure functions (and static renders of small components).
// Playwright still covers the app end to end.
export default defineConfig({
  resolve: {
    alias: { '@': src, '@shared': src },
  },
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
