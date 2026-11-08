/**
 * Canonical site URL for the current deployment.
 *
 * Read order (first non-empty wins):
 *   1. NEXT_PUBLIC_APP_URL — already used in app/layout.tsx metadataBase
 *   2. NEXT_PUBLIC_FRONTEND_DOMAIN — mirrors the BE `FRONTEND_DOMAIN`
 *      env var so the same domain name lives in one Railway / Vercel
 *      variable across BE + FE deployments.
 *   3. NEXT_PUBLIC_SITE_URL — optional alias.
 *   4. Fallback to https://predit.market for prod safety.
 *
 * Examples per deployment:
 *   prod:  https://predit.market
 *   intl:  https://intl.predit.market
 *   dev:   http://localhost:3000
 *
 * Trailing slashes are stripped so callers can do `${SITE_URL}/market/...`
 * without doubling up.
 */
export const SITE_URL: string = (
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXT_PUBLIC_FRONTEND_DOMAIN ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  'https://predit.market'
).replace(/\/+$/, '');
