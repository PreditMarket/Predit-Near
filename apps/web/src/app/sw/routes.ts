import {
  CacheableResponsePlugin,
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  type RuntimeCaching,
  type SerwistPlugin,
} from 'serwist';
import { isFreshCopy, stampCachedAt } from '@/lib/pwa/sw-cache-age';
import {
  classifyRequest,
  pageCacheKey,
  PUBLIC_API_MAX_AGE_MS,
  SW_CACHE,
  SW_CACHE_HEADER,
  type SwRouteConfig,
  type SwRouteKind,
} from '@/lib/pwa/sw-routes';

const DAY = 24 * 60 * 60;

/**
 * Enforces the public API cache's 5 minutes. ExpirationPlugin's own
 * per-read check goes by the `Date` header, which a cross-origin response
 * doesn't expose to the worker — so every copy passed as fresh, for as long
 * as it stayed in the cache. Each copy is stamped as it's stored instead,
 * and one past the limit is never served (the request then fails like any
 * other offline one).
 */
const maxAge = (maxAgeMs: number): SerwistPlugin => ({
  cacheWillUpdate: async ({ response }) => stampCachedAt(response),
  cachedResponseWillBeUsed: async ({ cachedResponse }) =>
    cachedResponse && isFreshCopy(cachedResponse, Date.now(), maxAgeMs) ? cachedResponse : null,
});

/**
 * Saves a page under its path alone (lib/pwa/sw-routes.ts pageCacheKey) —
 * a string key: a navigation Request can't be rebuilt with another URL.
 */
const pathOnlyKey: SerwistPlugin = {
  cacheKeyWillBeUsed: async ({ request }) => pageCacheKey(request.url),
};

/**
 * Marks a public API response served from the cache with `x-sw-cache: 1`,
 * so the app can label it "Offline — showing saved data". The copy is a new
 * response: a cached cross-origin one only shows its safelisted headers, so
 * CORS has to be restated — the page may read the new header, from this
 * site's origin.
 */
const markServedFromCache = (appOrigin: string): SerwistPlugin => ({
  cachedResponseWillBeUsed: async ({ cachedResponse }) => {
    if (!cachedResponse) return cachedResponse;
    const headers = new Headers(cachedResponse.headers);
    headers.set(SW_CACHE_HEADER, '1');
    headers.set('Access-Control-Allow-Origin', appOrigin);
    headers.set('Access-Control-Expose-Headers', SW_CACHE_HEADER);
    return new Response(cachedResponse.body, {
      status: cachedResponse.status,
      statusText: cachedResponse.statusText,
      headers,
    });
  },
});

/**
 * The SW's runtime routes. Which request goes where is decided in one place,
 * the pure (and tested) classifyRequest; this only maps each kind to its
 * Serwist strategy. The kinds don't overlap, so the order here doesn't matter.
 *
 * `network-only` gets no route at all: with none matching (and no default
 * handler), the worker doesn't answer the fetch and the browser makes it
 * itself — signed-in reads, writes, prices and RPC never pass through the
 * worker, nor through the /~offline fallback (sw.ts `fallbacks` only hooks
 * the strategies below). Writes in particular: no SW queueing (plan R3; the
 * social outbox lives in the app, not here).
 */
export function runtimeCaching(config: SwRouteConfig): RuntimeCaching[] {
  const is =
    (kind: Exclude<SwRouteKind, 'network-only'>) =>
    ({ request, url }: { request: Request; url: URL }) =>
      classifyRequest(
        {
          url,
          method: request.method,
          mode: request.mode,
          destination: request.destination,
          authorized: request.headers.has('Authorization'),
          accept: request.headers.get('Accept'),
        },
        config,
      ) === kind;

  return [
    {
      // Precached on install; this catches chunks that missed the precache
      // (over its size cap, or newer than the running SW). Roomy enough that
      // evicting by count can't take out a chunk the running build still
      // needs (hashed names: an older build's chunks simply age out).
      matcher: is('next-static'),
      handler: new CacheFirst({
        cacheName: SW_CACHE.nextStatic,
        plugins: [new ExpirationPlugin({ maxEntries: 1000, maxAgeSeconds: 7 * DAY })],
      }),
    },
    {
      matcher: is('media'),
      handler: new CacheFirst({
        cacheName: SW_CACHE.media,
        plugins: [
          // Complete responses only. An opaque one (status 0 — a cross-origin
          // <img> without CORS) is counted against the quota at a padded
          // size of megabytes each, and its status can't even be checked.
          new CacheableResponsePlugin({ statuses: [200] }),
          new ExpirationPlugin({
            maxEntries: 150,
            maxAgeSeconds: 30 * DAY,
            purgeOnQuotaError: true,
          }),
        ],
      }),
    },
    {
      // The network, always — no timeout: a slow page is still the current
      // one. Only when the request fails (offline): the copy from the last
      // visit, else the /~offline shell (Serwist `fallbacks` in sw.ts).
      // Cleared on every new worker (sw.ts) and on sign-out (messages.ts).
      matcher: is('navigation'),
      handler: new NetworkFirst({
        cacheName: SW_CACHE.pages,
        plugins: [
          pathOnlyKey,
          new CacheableResponsePlugin({ statuses: [200] }),
          new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 7 * DAY }),
        ],
      }),
    },
    {
      // Only reached without Authorization, so nothing here is one account's.
      matcher: is('public-api'),
      handler: new NetworkFirst({
        cacheName: SW_CACHE.publicApi,
        networkTimeoutSeconds: 4,
        plugins: [
          new CacheableResponsePlugin({ statuses: [200] }),
          new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 5 * 60 }),
          // After the 200 check: only what will be cached gets stamped.
          maxAge(PUBLIC_API_MAX_AGE_MS),
          // Last: an entry the age checks let through.
          markServedFromCache(config.appOrigin),
        ],
      }),
    },
  ];
}
