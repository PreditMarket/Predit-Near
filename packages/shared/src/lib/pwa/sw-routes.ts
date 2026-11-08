/**
 * Which caching strategy the service worker (apps/web/src/app/sw.ts) applies
 * to a request. Pure, so the rules that keep one account's data and stale
 * prices out of the cache are unit tested rather than trusted.
 *
 *   next-static   CacheFirst  hashed /_next/static JS/CSS (most are precached)
 *   media         CacheFirst  the site's own fonts, icons, images — 30 days,
 *                             150 entries, only complete (200) responses.
 *                             Other sites' images (pump.fun / IPFS logos, X
 *                             media) are the browser's: proxied, they could
 *                             not be cached (opaque) and a hanging gateway
 *                             held the page's load event forever (plan 21)
 *   navigation    NetworkFirst — the cached page (query stripped) only when
 *                             the network fails, then /~offline
 *   public-api    NetworkFirst 4s, cached copy at most 5 minutes old
 *                             (stamped x-sw-cached-at, enforced on read)
 *   network-only  never cached: signed-in requests, writes, prices, odds,
 *                 balances, RPC. The SW registers no route for these: the
 *                 browser fetches them itself, never proxied by the worker
 *   null          not the SW's business — the browser fetches it as usual
 */

export type SwRouteKind =
  | 'next-static'
  | 'media'
  | 'navigation'
  | 'public-api'
  | 'network-only';

export interface SwRequest {
  url: URL;
  method: string;
  /** `Request.mode` — 'navigate' for a page load. */
  mode: string;
  /** `Request.destination` — 'image', 'font', 'document', '' for fetch(). */
  destination: string;
  /** Whether an `Authorization` header is present. */
  authorized: boolean;
  /** The `Accept` header, if any. */
  accept?: string | null;
}

export interface SwRouteConfig {
  /** The site's own origin (`self.location.origin`). */
  appOrigin: string;
  /** Origins of the BE API — it lives on another host than the site. */
  apiOrigins: readonly string[];
  /** Origins of the configured Solana RPC endpoints. */
  rpcOrigins?: readonly string[];
}

/** Cache names, shared with the offline page (which lists cached pages). */
export const SW_CACHE = {
  nextStatic: 'next-static',
  media: 'media',
  pages: 'pages',
  publicApi: 'public-api',
} as const;

/**
 * Set to '1' by the SW on a public API response it answered from its cache
 * (network down or slower than 4s), so the app can say the data is saved,
 * not live (lib/pwa/sw-cache-flag.ts).
 */
export const SW_CACHE_HEADER = 'x-sw-cache';

/**
 * When the SW stored a public API response (epoch ms). The `Date` header
 * the expiration plugin would go by isn't readable on a cross-origin
 * response, so the worker stamps its own (lib/pwa/sw-cache-age.ts).
 */
export const SW_CACHED_AT_HEADER = 'x-sw-cached-at';

/** A saved public API response older than this is never served. */
export const PUBLIC_API_MAX_AGE_MS = 5 * 60 * 1000;

/**
 * First path segment (after /api/v1 or /api/v2) of BE routes that serve
 * prices, odds, order books, quotes, balances or positions — a stale copy
 * shown as live is a money bug (plan R2). From packages/shared/src/services:
 *
 *   perps venues     phoenix-perps, perps, lighter-perps
 *   spot             spot
 *   PAMM             pamm-markets (list + detail carry yes/no prices, pool
 *                    reserves; /realtime, /trades), pamm (collaterals,
 *                    balances), pamm-kol (creator markets with prices)
 *   other markets    polymarket, kalshi, dflow (Kalshi via DFlow),
 *                    quick-markets (price markets), oracles (odds, status),
 *                    market / markets (V1 XP markets: odds, bets),
 *                    market-groups (members joined with their yesPrice)
 *   the account      balances, pnl
 *
 * Still cacheable (no price on them): social (leaders, profiles, feed),
 * posts, news, categories, topics, stats, xp-events leaderboards.
 */
const MARKET_DATA_PREFIXES = new Set([
  'phoenix-perps',
  'perps',
  'lighter-perps',
  'spot',
  'pamm-markets',
  'pamm',
  'pamm-kol',
  'polymarket',
  'kalshi',
  'dflow',
  'quick-markets',
  'oracles',
  'market',
  'markets',
  'market-groups',
  'balances',
  'pnl',
]);

/** Any segment like these marks market data, whatever the prefix. */
const MARKET_DATA_SEGMENTS = new Set([
  'quote',
  'price',
  'prices',
  'mark-price',
  'odds',
  'orderbook',
  'candles',
  'ohlc',
  'ohlcv',
  'stream',
  'realtime',
  'balance',
  'balances',
  'positions',
  'holdings',
]);

/** Solana RPC providers, in case one is reached outside the configured list. */
const RPC_HOST =
  /(^|\.)(solana\.com|helius-rpc\.com|quiknode\.pro|rpcpool\.com|alchemy\.com|ankr\.com|syndica\.io|extrnode\.com)$/;

const MEDIA_EXT = /\.(?:png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf)$/i;

/** Unique origins of the given URLs; blanks and malformed ones are skipped. */
export function originsOf(urls: readonly (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const raw of urls) {
    if (!raw?.trim()) continue;
    try {
      out.add(new URL(raw.trim()).origin);
    } catch {
      // Not a URL — nothing to match against.
    }
  }
  return [...out];
}

const isMarketData = (pathname: string) => {
  const segments = pathname
    .replace(/^\/api\/v\d+/, '')
    .split('/')
    .filter(Boolean);
  return (
    (segments[0] !== undefined && MARKET_DATA_PREFIXES.has(segments[0])) ||
    segments.some((s) => MARKET_DATA_SEGMENTS.has(s))
  );
};

/**
 * The key a page is saved under: its path, without query or hash. `/?source=
 * pwa` (the manifest's start_url), tracking parameters and `?tab=` all reuse
 * one copy instead of filling the cache with near-duplicates.
 */
export function pageCacheKey(url: string | URL): string {
  const u = new URL(url);
  return `${u.origin}${u.pathname}`;
}

export function classifyRequest(
  req: SwRequest,
  config: SwRouteConfig,
): SwRouteKind | null {
  const { url } = req;
  // The SW never sees WebSockets; listed so the rule is written down.
  if (url.protocol === 'ws:' || url.protocol === 'wss:') return 'network-only';
  // Writes are never cached, and never queued by the SW (plan R3).
  if (req.method !== 'GET') return 'network-only';
  // A signed-in response may hold that account's data (plan R1).
  if (req.authorized) return 'network-only';
  if (req.accept?.includes('text/event-stream')) return 'network-only';
  if (config.rpcOrigins?.includes(url.origin) || RPC_HOST.test(url.hostname)) {
    return 'network-only';
  }

  if (config.apiOrigins.includes(url.origin)) {
    return isMarketData(url.pathname) ? 'network-only' : 'public-api';
  }

  const sameOrigin = url.origin === config.appOrigin;
  if (sameOrigin && req.mode === 'navigate') {
    return url.pathname.startsWith('/api/') ? null : 'navigation';
  }
  if (sameOrigin && url.pathname.startsWith('/_next/static/')) {
    return url.pathname.startsWith('/_next/static/media/') ? 'media' : 'next-static';
  }
  if (sameOrigin && url.pathname.startsWith('/_next/image')) return 'media';
  if (sameOrigin && (req.destination === 'image' || req.destination === 'font')) return 'media';
  if (sameOrigin && MEDIA_EXT.test(url.pathname)) return 'media';
  return null;
}
