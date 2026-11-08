/** Messages the app posts to the service worker (apps/web/src/app/sw.ts). */
export const SW_MESSAGE = {
  /** Drop cached public API responses and saved pages — sent on sign-out (plan R1). */
  clearApiCache: 'clear-api-cache',
  /** Activate the waiting worker; Serwist handles it (update toast). */
  skipWaiting: 'SKIP_WAITING',
  /** Register the 'outbox' Background Sync — sent when a write is queued. */
  outboxRegisterSync: 'outbox-register-sync',
} as const;

/** Messages the service worker posts to open pages. */
export const SW_EVENT = {
  /** Connection is back (Background Sync fired): send the outbox. */
  outboxFlush: 'outbox-flush',
  /** The browser rotated the push subscription: tell BE (it has the token). */
  pushSubscriptionChanged: 'push-subscription-changed',
} as const;

/** The Background Sync tag the outbox registers. */
export const OUTBOX_SYNC_TAG = 'outbox';

/**
 * Asks the SW to drop its API cache and its saved pages. Nothing in them
 * carried Authorization, but what the last person browsed still shouldn't
 * outlive their session on a shared device. A no-op where there is no SW
 * (dev, unsupported browsers).
 */
export async function clearServiceWorkerApiCache(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const worker = navigator.serviceWorker.controller ?? registration?.active;
    worker?.postMessage({ type: SW_MESSAGE.clearApiCache });
  } catch {
    // No registration to reach — nothing cached either.
  }
}
