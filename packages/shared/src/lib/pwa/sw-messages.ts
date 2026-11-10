/** Messages the app posts to the service worker (apps/web/src/app/sw.ts). */
export const SW_MESSAGE = {
  /** Activate the waiting worker; Serwist handles it (update toast). */
  skipWaiting: 'SKIP_WAITING',
} as const;
