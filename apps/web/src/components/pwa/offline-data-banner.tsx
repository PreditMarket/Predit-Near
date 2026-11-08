'use client';

import { useEffect, useReducer } from 'react';
import { usePathname } from 'next/navigation';
import { WifiOff } from 'lucide-react';
import {
  clearResponseSources,
  savedDataExpiresAt,
  showSavedDataBanner,
  useSavedDataFlags,
} from '@/store/offline-data.store';
import { useOnline } from '@/hooks/use-online';

/**
 * "Offline — showing saved data": while the browser is offline, or while
 * data on screen is the service worker's saved copy of a public read (it
 * answered from cache because the network failed or was too slow) — for a
 * minute after the last such answer, and only on the page it came for.
 */
export function OfflineDataBanner() {
  const offline = !useOnline();
  const flags = useSavedDataFlags();
  const pathname = usePathname();
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  // Back online: the refetches that follow decide again what's saved data.
  useEffect(() => {
    if (!offline) clearResponseSources();
  }, [offline]);

  // Another page: its own reads decide (the flags were the last page's).
  useEffect(() => {
    clearResponseSources();
  }, [pathname]);

  // Re-check when the newest flag lapses.
  useEffect(() => {
    const expiresAt = savedDataExpiresAt(flags);
    if (expiresAt === null) return;
    const id = window.setTimeout(rerender, Math.max(0, expiresAt - Date.now()) + 50);
    return () => window.clearTimeout(id);
  }, [flags]);

  if (!showSavedDataBanner({ offline, cachedUrls: flags })) return null;
  return (
    <div
      role="status"
      data-testid="offline-data-banner"
      className="flex items-center justify-center gap-1.5 border-b border-border bg-muted/40 px-4 py-1 text-[11px] text-muted-foreground"
    >
      <WifiOff className="size-3" />
      Offline — showing saved data
    </div>
  );
}
