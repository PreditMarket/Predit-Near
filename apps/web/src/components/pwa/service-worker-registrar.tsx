/// <reference types="@serwist/next/typings" />
'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { SW_MESSAGE } from '@/lib/pwa/sw-messages';

const UPDATE_CHECK_MS = 60 * 60 * 1000;

let registered = false;
/** This tab asked for the reload itself. */
let reloading = false;
/** A worker controlled this tab: a later controllerchange is an update. */
let hadController = false;
/** Another tab took the update: this page runs the previous build. */
let staleBuild = false;

/**
 * Registers the service worker (src/app/sw.ts) in production builds. A new
 * version never shows a prompt and never switches mid-page (a worker taking
 * over would swap the JS under someone signing): it is applied on the next
 * route change, when nothing is being signed. Not while a mutation is in
 * flight — the following route change tries again. When another tab took the
 * update first, this tab reloads on its next route change.
 *
 * `window.serwist` is created by @serwist/next's entry script, which the
 * build only includes when the SW is enabled (not in `next dev`).
 */
export function ServiceWorkerRegistrar() {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const lastPathname = useRef(pathname);

  useEffect(() => {
    const serwist = window.serwist as typeof window.serwist | undefined;
    if (process.env.NODE_ENV !== 'production' || !serwist) return;
    const container = navigator.serviceWorker;
    if (!registered) {
      registered = true;
      hadController = !!container.controller;
      container.addEventListener('controllerchange', onControllerChange);
      // Rejects where registration is refused (blocked, private mode…).
      void serwist.register().catch(() => undefined);
    }

    const checkForUpdate = () => void serwist.update().catch(() => undefined);
    // Back to a tab left in the background: fetch a worker deployed since,
    // to be applied on the next route change.
    const onVisible = () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    };
    document.addEventListener('visibilitychange', onVisible);
    // A tab left open for days would otherwise only learn of a deploy on its
    // next full navigation.
    const id = window.setInterval(checkForUpdate, UPDATE_CHECK_MS);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  useEffect(() => {
    if (pathname === lastPathname.current) return;
    lastPathname.current = pathname;
    if (process.env.NODE_ENV !== 'production' || !window.serwist) return;
    if (queryClient.isMutating() > 0) return;
    if (staleBuild) {
      window.location.reload();
      return;
    }
    void (async () => {
      if ((await waitingWorker()) && navigator.serviceWorker.controller) await activateUpdate();
    })();
  }, [pathname, queryClient]);

  return null;
}

async function waitingWorker(): Promise<ServiceWorker | null> {
  try {
    return (await navigator.serviceWorker.getRegistration())?.waiting ?? null;
  } catch {
    // No registration to read: nothing waiting.
    return null;
  }
}

/**
 * Activates the waiting worker, then reloads once it controls the page. No
 * worker waiting any more (another tab activated it): just reload.
 */
async function activateUpdate() {
  reloading = true;
  const waiting = await waitingWorker();
  if (!waiting) {
    window.location.reload();
    return;
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), {
    once: true,
  });
  waiting.postMessage({ type: SW_MESSAGE.skipWaiting });
}

/**
 * The worker in control changed. First install (clientsClaim): nothing to do.
 * Otherwise another tab took the update: this page still runs the old build,
 * so the next route change reloads it.
 */
function onControllerChange() {
  if (!hadController) {
    hadController = true;
    return;
  }
  if (!reloading) staleBuild = true;
}
