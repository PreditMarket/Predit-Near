import type { NextConfig } from 'next';
import webpack from 'webpack';
import { withSentryConfig } from '@sentry/nextjs';
import withSerwistInit from '@serwist/next';
import { randomUUID } from 'crypto';
// Relative, not '@/': this file is loaded by Node, outside the app's aliases.
import { shellPrecache, type AppBuildPages } from '../../packages/shared/src/lib/pwa/precache';

/** Old public/ icon paths → their public/icons/ successors (see redirects). */
const LEGACY_ICON_REDIRECTS: Array<[string, string]> = [
  ['/icon-48x48.png', '/icons/icon-192.png'],
  ['/icon-72x72.png', '/icons/icon-192.png'],
  ['/icon-96x96.png', '/icons/icon-192.png'],
  ['/icon-144x144.png', '/icons/icon-192.png'],
  ['/icon-192x192.png', '/icons/icon-192.png'],
  ['/icon-192x192-maskable.png', '/icons/icon-192-maskable.png'],
  ['/icon-512.png', '/icons/icon-512.png'],
  ['/icon-512-maskable.png', '/icons/icon-512-maskable.png'],
  ['/manifest.json', '/manifest.webmanifest'],
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // isomorphic-dompurify pulls jsdom into the server bundle for SSR sanitize.
  // Mark as external so webpack stops bundling it, and include jsdom's
  // runtime assets (default-stylesheet.css, etc.) in the output trace so
  // they ship with the production build.
  serverExternalPackages: ['jsdom', 'isomorphic-dompurify'],
  outputFileTracingIncludes: {
    '/**': ['./node_modules/jsdom/**/*'],
  },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      crypto: false,
    };
    config.plugins.push(
      new webpack.ProvidePlugin({ Buffer: ['buffer', 'Buffer'] }),
    );
    return config;
  },
  images: {
    // Serve AVIF first (best compression), fall back to WebP.
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  experimental: {
    // packages/shared is compiled here as source, through the tsconfig alias.
    externalDir: true,
    serverActions: {
      bodySizeLimit: '2mb',
    },
    optimizePackageImports: [
      'lucide-react',
      '@tanstack/react-query',
      'zustand',
      '@radix-ui/react-popover',
    ],
  },
  // The service worker must never be cached by the browser or a proxy, or a
  // fixed version (or the kill switch, see src/app/sw.ts) can't reach users.
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
    ];
  },
  // 301 canonicalization. Crawlers + audit tools flag duplicate content when
  // the same page resolves on both www and apex domains.
  async redirects() {
    return [
      // The icons and manifest moved (public/icons/, app/manifest.ts); the old
      // URLs may still be in emails, bookmarks, an installed app's manifest
      // or another site's config. Each goes to the nearest new size.
      ...LEGACY_ICON_REDIRECTS.map(([source, destination]) => ({
        source,
        destination,
        permanent: true,
      })),
      // Legacy alias — `/market` was the previous listing route. A real 308
      // here rather than redirect() in a page: that prerendered a 200 with a
      // meta refresh, so visitors loaded the whole app shell before going on.
      { source: '/market', destination: '/markets', permanent: true },
      // Short legal URLs people type or paste. (`/help` is a real route.)
      { source: '/terms', destination: '/terms-of-service', permanent: true },
      { source: '/privacy', destination: '/privacy-policy', permanent: true },
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.predit.market' }],
        destination: 'https://predit.market/:path*',
        permanent: true,
      },
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.intl.predit.market' }],
        destination: 'https://intl.predit.market/:path*',
        permanent: true,
      },
    ];
  },
};

// Bundles src/app/sw.ts into public/sw.js (gitignored) with the build's
// precache list. Webpack only — when the app moves to Turbopack, switch to
// @serwist/turbopack. Off in `next dev` so nothing is cached while developing.
const BUILD_REVISION = randomUUID();
const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
  // components/pwa/service-worker-registrar.tsx registers it (production
  // only) and owns the update prompt; no reload when the network returns.
  register: false,
  reloadOnOnline: false,
  cacheOnNavigation: false,
  // Instead of the whole public/ dir (splash screens, legal pages…): the
  // offline shell and what it shows. A new revision per build re-fetches them.
  additionalPrecacheEntries: ['/~offline', '/logo-MarkWhite.svg', '/icons/icon-192.png'].map(
    (url) => ({ url, revision: BUILD_REVISION }),
  ),
  // Precache only what the offline shell renders with (~5 MB, not all ~12 MB
  // of .next/static); other chunks are cached as pages first load them. The
  // build's app-build-manifest (emitted earlier in this same compilation)
  // says which files the shell's layouts and page load.
  manifestTransforms: [
    async (entries, compilation) => {
      const asset = (
        compilation as { getAsset?: (name: string) => { source: { source(): unknown } } | undefined }
      )?.getAsset?.('app-build-manifest.json');
      let pages: AppBuildPages | null = null;
      try {
        pages = asset ? JSON.parse(String(asset.source.source())).pages : null;
      } catch {
        pages = null;
      }
      return {
        manifest: shellPrecache(entries, pages),
        warnings: pages ? [] : ['app-build-manifest.json not found: precaching the shell by name only'],
      };
    },
  ],
});

export default withSentryConfig(withSerwist(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN || undefined,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  // Replay isn't used (see sentry.client.config.ts): leave its worker, iframe
  // and shadow-DOM recording out of the client bundle, and the SDK's debug
  // logging too.
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
    excludeReplayIframe: true,
    excludeReplayShadowDom: true,
    excludeReplayWorker: true,
  },
  sourcemaps: {
    // Source maps are only worth generating when they can be uploaded.
    // Without a token they were built (full maps, client and server) and
    // then thrown away — a large share of a cold build's compile time.
    disable: !process.env.SENTRY_AUTH_TOKEN,
    // Delete source maps from the build output after uploading to Sentry
    // so they are not shipped to clients (equivalent to old hideSourceMaps).
    filesToDeleteAfterUpload: ['.next/**/*.map'],
  },
});
