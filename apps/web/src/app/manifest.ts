import type { MetadataRoute } from 'next';

// --background in globals.css: the status bar, the splash screen and the
// first paint are one colour.
const BACKGROUND = '#14141C';

/**
 * Served at /manifest.webmanifest, and linked from every page by Next.
 * Icons and splash images are rendered by scripts/pwa-assets.mjs.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Predit',
    short_name: 'Predit',
    description:
      'Prediction markets from the posts you read, settled on NEAR.',
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
    shortcuts: [
      { name: 'Markets', url: '/markets', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Portfolio', url: '/portfolio', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
