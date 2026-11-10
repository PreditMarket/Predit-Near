/// <reference lib="webworker" />
/**
 * The service worker, bundled by @serwist/next into public/sw.js (production
 * builds only — see next.config.ts). Registered by
 * components/pwa/service-worker-registrar.tsx.
 *
 * Each concern lives in its own module under ./sw/ and is wired up here:
 *   routes.ts    what is cached, and how (plan 5.2)
 *   messages.ts  messages from the app (clear-api-cache on sign-out), and
 *                the saved pages dropped when a new worker activates
 *   push.ts      web push: push, notificationclick, pushsubscriptionchange
 *   outbox.ts    Background Sync wake-up for the offline outbox (plan 5.3)
 * Add new event handlers the same way, before `serwist.addEventListeners()`.
 *
 * The precache list is trimmed at build time to what the offline shell needs
 * (next.config.ts, lib/pwa/precache.ts); every other chunk is cached as it's
 * first loaded (routes.ts, next-static).
 *
 * Updates: no automatic skipWaiting. A new worker waits until the user takes
 * the "New version available — Reload" toast, or until their next route
 * change (service-worker-registrar.tsx), so the JS never changes under
 * someone mid-signature. `clientsClaim` only matters on a first install (no
 * older worker to displace): it lets the first visit work offline at once.
 *
 * Kill switch — if a bad worker ships, replace this file's body with the
 * following and deploy; every client drops its caches, unregisters and
 * reloads onto plain network on its next visit (sw.js is served no-cache):
 *
 *   self.addEventListener('install', () => self.skipWaiting());
 *   self.addEventListener('activate', (event) => event.waitUntil((async () => {
 *     for (const key of await caches.keys()) await caches.delete(key);
 *     await self.registration.unregister();
 *     for (const client of await self.clients.matchAll({ type: 'window' })) {
 *       client.navigate(client.url);
 *     }
 *   })()));
 */

import { Serwist, type PrecacheEntry, type SerwistGlobalConfig } from 'serwist';
import { originsOf } from '@/lib/pwa/sw-routes';
import { NEAR_RPC_URLS } from '@/lib/near/config';
import { runtimeCaching } from './sw/routes';
import { addActivateHandlers } from './sw/messages';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Injected at build time: the precache list.
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

addActivateHandlers();

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: runtimeCaching({
    appOrigin: self.location.origin,
    rpcOrigins: originsOf(NEAR_RPC_URLS),
  }),
  fallbacks: {
    entries: [
      {
        url: '/~offline',
        matcher: ({ request }) => request.destination === 'document',
      },
    ],
  },
});

serwist.addEventListeners();
