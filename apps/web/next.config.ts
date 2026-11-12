import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';
import withSerwistInit from '@serwist/next';
import { randomUUID } from 'crypto';
// Relative, not '@/': this file is loaded by Node, outside the app's aliases.
import { shellPrecache, type AppBuildPages } from '../../packages/shared/src/lib/pwa/precache';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // A second build (tests, a demo) can sit beside `next dev` without either overwriting the other.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // isomorphic-dompurify pulls jsdom into the server bundle for SSR sanitize.
  // Mark as external so webpack stops bundling it, and include jsdom's
  // runtime assets (default-stylesheet.css, etc.) in the output trace so
  // they ship with the production build.
  serverExternalPackages: ['jsdom', 'isomorphic-dompurify'],
  outputFileTracingIncludes: {
    '/**': ['./node_modules/jsdom/**/*'],
  },
  images: {
    // Serve AVIF first (best compression), fall back to WebP.
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  experimental: {
    // packages/shared is compiled here as source, through the tsconfig alias.
    externalDir: true,
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
  async redirects() {
    // `/market` alone has no page; the list lives at `/markets`.
    return [{ source: '/market', destination: '/markets', permanent: true }];
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
  // Instead of the whole public/ dir (splash screens…): the
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
