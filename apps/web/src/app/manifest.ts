import type { MetadataRoute } from 'next';

// --background in globals.css: the status bar, the splash screen and the
// first paint are one colour.
const BACKGROUND = '#14141C';

/**
 * Served at /manifest.webmanifest, and linked from every page by Next.
 * Icons and splash images are rendered by scripts/pwa-assets.mjs; the
 * screenshots by playwright/specs/pwa-screenshots.spec.ts.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Predit',
    short_name: 'Predit',
    description:
      'Permissionless social prediction markets and perps on Solana.',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    // Not `portrait-primary`: that locks tablets out of upside-down portrait.
    orientation: 'portrait',
    theme_color: BACKGROUND,
    background_color: BACKGROUND,
    categories: ['finance'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-192-maskable.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    // Chrome's richer install sheet shows these.
    screenshots: [
      {
        src: '/screenshots/leaders-wide.png',
        sizes: '1280x800',
        type: 'image/png',
        form_factor: 'wide',
        label: 'Top traders by ROI',
      },
      {
        src: '/screenshots/leaders-narrow.png',
        sizes: '750x1334',
        type: 'image/png',
        form_factor: 'narrow',
        label: 'Top traders by ROI',
      },
    ],
    shortcuts: [
      { name: 'Perps', url: '/perps', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      {
        name: 'Portfolio',
        url: '/portfolio',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
      { name: 'Leaderboard', url: '/leaderboard', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
