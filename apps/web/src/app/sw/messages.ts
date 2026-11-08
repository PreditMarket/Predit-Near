import { SW_CACHE } from '@/lib/pwa/sw-routes';
import { SW_MESSAGE } from '@/lib/pwa/sw-messages';

declare const self: ServiceWorkerGlobalScope;

/**
 * The app's messages to the SW. SKIP_WAITING is Serwist's own listener (it is
 * installed because sw.ts leaves `skipWaiting` off).
 *
 * clear-api-cache (sign-out) drops the saved pages too: a page's HTML can
 * hold what that session saw (server-rendered for it), and the next person on
 * the device mustn't be shown it offline.
 */
export function addMessageHandlers() {
  self.addEventListener('message', (event) => {
    if (event.data?.type === SW_MESSAGE.clearApiCache) {
      event.waitUntil(
        Promise.all([caches.delete(SW_CACHE.publicApi), caches.delete(SW_CACHE.pages)]),
      );
    }
  });
}

/**
 * A new worker drops the pages the previous one saved: their HTML points at
 * the previous build's chunks, which the new build no longer serves — offline
 * they'd open half-broken. Pages are saved again as they're visited.
 */
export function addActivateHandlers() {
  self.addEventListener('activate', (event) => {
    event.waitUntil(caches.delete(SW_CACHE.pages));
  });
}
