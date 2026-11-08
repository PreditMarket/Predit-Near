import { create } from 'zustand';

/**
 * Which API reads on screen came from the service worker's cache rather than
 * the network (lib/pwa/sw-cache-flag.ts) — the "Offline — showing saved
 * data" banner shows while any did, recently.
 *
 * A flag is only as good as the screen it was raised on: each one lapses
 * after SAVED_DATA_FLAG_MS, and they're all dropped on navigation (the next
 * page's reads decide again). A one-off cached answer can't pin the banner
 * for the rest of the session.
 */
interface OfflineDataState {
  /** Request URL → when its latest response was the SW's saved copy (ms). */
  cachedUrls: Record<string, number>;
}

/** A "saved data" flag counts for this long after the response came in. */
export const SAVED_DATA_FLAG_MS = 60_000;

export const useOfflineDataStore = create<OfflineDataState>(() => ({ cachedUrls: {} }));

/** Records where the latest response for `url` came from. */
export function noteResponseSource(url: string, fromCache: boolean, now = Date.now()) {
  const { cachedUrls } = useOfflineDataStore.getState();
  if (!fromCache && !(url in cachedUrls)) return;
  const next = { ...cachedUrls };
  if (fromCache) next[url] = now;
  else delete next[url];
  useOfflineDataStore.setState({ cachedUrls: next });
}

/** Forget it all — on reconnect or navigation; the reads that follow re-mark. */
export const clearResponseSources = () => useOfflineDataStore.setState({ cachedUrls: {} });

/** The newest flag still within SAVED_DATA_FLAG_MS of `now`, or null. */
export function latestSavedDataFlag(
  cachedUrls: Record<string, number>,
  now = Date.now(),
): number | null {
  let latest: number | null = null;
  for (const at of Object.values(cachedUrls)) {
    if (now - at < SAVED_DATA_FLAG_MS && (latest === null || at > latest)) latest = at;
  }
  return latest;
}

/** Whether the banner shows: offline, or some saved copy came in the last minute. */
export function showSavedDataBanner(
  { offline, cachedUrls }: { offline: boolean; cachedUrls: Record<string, number> },
  now = Date.now(),
): boolean {
  return offline || latestSavedDataFlag(cachedUrls, now) !== null;
}

/** When the newest live flag lapses (ms), or null if none is live. */
export const savedDataExpiresAt = (cachedUrls: Record<string, number>, now = Date.now()) => {
  const latest = latestSavedDataFlag(cachedUrls, now);
  return latest === null ? null : latest + SAVED_DATA_FLAG_MS;
};

export const useSavedDataFlags = () => useOfflineDataStore((s) => s.cachedUrls);
