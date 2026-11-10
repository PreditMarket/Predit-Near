/**
 * Which caching strategy the service worker (apps/web/src/app/sw.ts) applies
 * to a request. Pure, so the rules are unit tested rather than trusted.
 *
 *   next-static   CacheFirst  hashed /_next/static JS/CSS (most are precached)
 *   media         CacheFirst  the site's own fonts, icons, images: 30 days,
 *                             150 entries, only complete (200) responses.
 *                             Other sites' images (X media, market images)
 *                             are the browser's: proxied they could not be
 *                             cached (opaque), and a hanging host would hold
 *                             the page's load event
 *   navigation    NetworkFirst: the cached page (query stripped) only when
 *                             the network fails, then /~offline
 *   network-only  never cached: writes, event streams, NEAR RPC. The SW
 *                 registers no route for these: the browser fetches them
 *                 itself, never proxied by the worker
 *   null          not the SW's business, including this site's own /api
 *                 routes: prices and balances must always be live
 */

export type SwRouteKind = 'next-static' | 'media' | 'navigation' | 'network-only';

export interface SwRequest {
  url: URL;
  method: string;
  /** `Request.mode`: 'navigate' for a page load. */
  mode: string;
  /** `Request.destination`: 'image', 'font', 'document', '' for fetch(). */
  destination: string;
  /** The `Accept` header, if any. */
  accept?: string | null;
}

export interface SwRouteConfig {
  /** The site's own origin (`self.location.origin`). */
  appOrigin: string;
  /** Origins of the NEAR RPC endpoints. */
  rpcOrigins?: readonly string[];
}

/** Cache names, shared with the offline page (which lists cached pages). */
export const SW_CACHE = {
  nextStatic: 'next-static',
  media: 'media',
  pages: 'pages',
} as const;

const MEDIA_EXT = /\.(?:png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf)$/i;

/** Unique origins of the given URLs; blanks and malformed ones are skipped. */
export function originsOf(urls: readonly (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const raw of urls) {
    if (!raw?.trim()) continue;
    try {
      out.add(new URL(raw.trim()).origin);
    } catch {
      // Not a URL: nothing to match against.
    }
  }
  return [...out];
}

/**
 * The key a page is saved under: its path, without query or hash. `/?source=
 * pwa` (the manifest's start_url), tracking parameters and `?tab=` all reuse
 * one copy instead of filling the cache with near-duplicates.
 */
export function pageCacheKey(url: string | URL): string {
  const u = new URL(url);
  return `${u.origin}${u.pathname}`;
}

export function classifyRequest(req: SwRequest, config: SwRouteConfig): SwRouteKind | null {
  const { url } = req;
  // The SW never sees WebSockets; listed so the rule is written down.
  if (url.protocol === 'ws:' || url.protocol === 'wss:') return 'network-only';
  // Writes are never cached, and never queued by the SW.
  if (req.method !== 'GET') return 'network-only';
  if (req.accept?.includes('text/event-stream')) return 'network-only';
  if (config.rpcOrigins?.includes(url.origin)) return 'network-only';

  if (url.origin !== config.appOrigin) return null;
  if (url.pathname.startsWith('/api/')) return null;
  if (req.mode === 'navigate') return 'navigation';
  if (url.pathname.startsWith('/_next/static/')) {
    return url.pathname.startsWith('/_next/static/media/') ? 'media' : 'next-static';
  }
  if (url.pathname.startsWith('/_next/image')) return 'media';
  if (req.destination === 'image' || req.destination === 'font') return 'media';
  if (MEDIA_EXT.test(url.pathname)) return 'media';
  return null;
}
