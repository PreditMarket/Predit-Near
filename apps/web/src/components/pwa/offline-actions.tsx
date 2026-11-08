'use client';

import { useEffect, useState } from 'react';
import { pageCacheKey, SW_CACHE } from '@/lib/pwa/sw-routes';

/**
 * The offline shell's retry button, and the pages the service worker kept
 * from earlier visits — those still open without a connection.
 */
export function OfflineActions() {
  const [pages, setPages] = useState<string[]>([]);

  useEffect(() => {
    if (typeof caches === 'undefined') return;
    caches
      .open(SW_CACHE.pages)
      .then((cache) => cache.keys())
      .then((requests) => {
        // Keys are path-only already (the worker strips queries); older
        // entries may still carry one — list each page once, by its path.
        const paths = requests
          .map((r) => new URL(pageCacheKey(r.url)))
          .filter((u) => u.origin === window.location.origin && u.pathname !== '/~offline')
          .map((u) => u.pathname);
        setPages([...new Set(paths)].slice(0, 8));
      })
      .catch(() => undefined);
  }, []);

  return (
    <>
      <button
        type="button"
        data-testid="offline-retry"
        onClick={() => window.location.reload()}
        className="mt-2 inline-flex h-9 items-center rounded-md bg-primary px-4 text-xs font-bold uppercase tracking-[0.06em] text-background transition-colors hover:bg-primary/85"
      >
        Try again
      </button>
      {pages.length > 0 && (
        <nav className="mt-4 w-full text-left">
          <p className="mb-1.5 text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
            Available offline
          </p>
          <ul className="divide-y divide-border rounded-md border border-border">
            {pages.map((path) => (
              <li key={path}>
                {/* A full page load, so the service worker answers it. */}
                <a href={path} className="block truncate px-3 py-2 text-sm hover:bg-muted/30">
                  {path === '/' ? 'Home' : path}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </>
  );
}
