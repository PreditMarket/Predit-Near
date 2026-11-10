import {
  CacheableResponsePlugin,
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  type RuntimeCaching,
  type SerwistPlugin,
} from 'serwist';
import {
  classifyRequest,
  pageCacheKey,
  SW_CACHE,
  type SwRouteConfig,
  type SwRouteKind,
} from '@/lib/pwa/sw-routes';

const DAY = 24 * 60 * 60;

/**
 * Saves a page under its path alone (lib/pwa/sw-routes.ts pageCacheKey) —
 * a string key: a navigation Request can't be rebuilt with another URL.
 */
const pathOnlyKey: SerwistPlugin = {
  cacheKeyWillBeUsed: async ({ request }) => pageCacheKey(request.url),
};

/**
 * The SW's runtime routes. Which request goes where is decided in one place,
 * the pure (and tested) classifyRequest; this only maps each kind to its
 * Serwist strategy. The kinds don't overlap, so the order here doesn't matter.
 *
 * `network-only` gets no route at all: with none matching (and no default
 * handler), the worker doesn't answer the fetch and the browser makes it
 * itself — signed-in reads, writes, prices and RPC never pass through the
 * worker, nor through the /~offline fallback (sw.ts `fallbacks` only hooks
 * the strategies below). Writes in particular: no SW queueing.
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
  ];
}
