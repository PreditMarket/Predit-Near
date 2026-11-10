import { SW_CACHE } from '@/lib/pwa/sw-routes';

declare const self: ServiceWorkerGlobalScope;

/**
 * A new worker drops the pages the previous one saved: their HTML points at
 * the previous build's chunks, which the new build no longer serves. Offline
 * they'd open half-broken. Pages are saved again as they're visited.
 */
export function addActivateHandlers() {
  self.addEventListener('activate', (event) => {
    event.waitUntil(caches.delete(SW_CACHE.pages));
  });
}
