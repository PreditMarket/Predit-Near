/**
 * Canonical site URL for the current deployment: `NEXT_PUBLIC_APP_URL`, else
 * the local dev server. Trailing slashes are stripped so callers can do
 * `${SITE_URL}/market/...` without doubling up.
 */
export const SITE_URL: string = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
