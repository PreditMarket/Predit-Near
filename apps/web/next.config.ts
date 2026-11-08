import type { NextConfig } from 'next';
import webpack from 'webpack';
import { withSentryConfig } from '@sentry/nextjs';
import withSerwistInit from '@serwist/next';
import { randomUUID } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
// Relative, not '@/': this file is loaded by Node, outside the app's aliases.
import { shellPrecache, type AppBuildPages } from '../../packages/shared/src/lib/pwa/precache';

const appDir = path.dirname(fileURLToPath(import.meta.url));

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

// The @solana/wallet-adapter-* family holds React context and MUST be a single
// instance across this app and the shared package (packages/shared). Because
// shared source is compiled here via the tsconfig alias, pnpm's peer resolution
// leaves TWO physical copies of these (verified in the store), which yields a
// second WalletContext and the "read publicKey on a WalletContext without
// providing one" error. Force every import to this app's single copy.
// (react / react-query are already deduped to one copy, so they're left alone —
// aliasing React can conflict with Next's own handling.)
const SINGLETONS = [
  '@solana/wallet-adapter-react',
  '@solana/wallet-adapter-react-ui',
];
const singletonAlias: Record<string, string> = {};
for (const pkg of SINGLETONS) {
  // Alias to this app's node_modules dir directly. `require.resolve` fails on
  // these packages (their `exports` blocks "./package.json"), so resolve by
  // path — webpack follows the symlink to a single store copy.
  const dir = path.join(appDir, 'node_modules', pkg);
  if (existsSync(dir)) singletonAlias[pkg] = dir;
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Share buttons attach the sharer's referral code to outgoing links. Opt-in
  // per app and declared here rather than in Railway env so it can't be lost
  // at deploy time; apps/admin deliberately omits it (see referral-link.ts).
  env: {
    NEXT_PUBLIC_REFERRAL_LINKS: 'on',
  },
  transpilePackages: [
    '@solana/web3.js',
    '@solana/spl-token',
    '@solana/wallet-adapter-react',
    '@solana/wallet-adapter-react-ui',
    '@solana/wallet-adapter-base',
  ],
  // isomorphic-dompurify pulls jsdom into the server bundle for SSR sanitize.
  // Mark as external so webpack stops bundling it, and include jsdom's
  // runtime assets (default-stylesheet.css, etc.) in the output trace so
  // they ship with the production build.
  serverExternalPackages: ['jsdom', 'isomorphic-dompurify'],
  outputFileTracingIncludes: {
    '/**': ['./node_modules/jsdom/**/*'],
  },
  webpack: (config, { isServer }) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      crypto: false,
    };
    // Pin context libraries to a single physical copy (see SINGLETONS above).
    config.resolve.alias = {
      ...config.resolve.alias,
      ...singletonAlias,
    };
    config.plugins.push(
      new webpack.ProvidePlugin({ Buffer: ['buffer', 'Buffer'] }),
    );
    // react-joyride uses React 17 APIs (unmountComponentAtNode) incompatible with React 18.
    // Mark as external for SSR so webpack doesn't attempt to bundle/analyze it server-side.
    if (isServer) {
      config.externals = [...(config.externals || []), 'react-joyride'];
    }
    return config;
  },
  images: {
    // Serve AVIF first (best compression), fall back to WebP.
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
    optimizePackageImports: [
      'lucide-react',
      '@tanstack/react-query',
      'zustand',
      '@radix-ui/react-popover',
      'react-hook-form',
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
