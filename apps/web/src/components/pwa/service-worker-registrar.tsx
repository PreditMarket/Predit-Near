/// <reference types="@serwist/next/typings" />
'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SW_MESSAGE } from '@/lib/pwa/sw-messages';

const UPDATE_CHECK_MS = 60 * 60 * 1000;
const TOAST_ID = 'sw-update';

let registered = false;
/** This tab asked for the reload itself — no "updated elsewhere" toast. */
let reloading = false;
/** A worker controlled this tab: a later controllerchange is an update. */
let hadController = false;
/** The waiting worker whose toast was closed: not offered again. */
let dismissed: ServiceWorker | null = null;
/** Another tab took the update: this page runs the previous build. */
let staleBuild = false;

/**
 * Registers the service worker (src/app/sw.ts) in production builds, and
 * offers each new version instead of switching to it on its own: a worker
 * that took over mid-session would swap the JS under someone signing an
 * order. Taking the toast activates the waiting worker, then reloads once it
 * controls the page.
 *
 * Every open tab offers it — the toast shows whenever the registration has a
 * waiting worker: on Serwist's `waiting`, at start, and each time the tab
 * comes back into view (after checking for a newer one). Closing the toast
 * stops offering that worker; the next deploy's is offered again. When
 * another tab takes the update first, this one's worker changes under it
 * (`controllerchange`): its toast becomes a plain "reload to finish".
 *
 * Without the toast, the update is applied on the next route change: whoever
 * navigates has left the page they were acting on, so the full load into the
 * new build costs nothing. Not while a mutation is in flight (its result
 * would be lost with the page) — the following route change tries again.
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
      serwist.addEventListener('waiting', () => void offerWaitingUpdate());
      container.addEventListener('controllerchange', onControllerChange);
      // Rejects where registration is refused (blocked, private mode…).
      void serwist
        .register()
        .then(() => offerWaitingUpdate())
        .catch(() => undefined);
    }

    const checkForUpdate = () => {
      void serwist
        .update()
        .catch(() => undefined)
        .then(() => offerWaitingUpdate());
    };
    // Back to a tab left in the background: a deploy (or another tab's
    // update check) may have left a worker waiting since.
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

/** Shows the toast if a new worker is waiting (installed, not yet active). */
async function offerWaitingUpdate() {
  const waiting = await waitingWorker();
  // No controller: a first install, there's nothing to update from.
  if (!waiting || !navigator.serviceWorker.controller || waiting === dismissed) return;
  toast('New version available', {
    id: TOAST_ID,
    duration: Infinity,
    action: { label: 'Reload', onClick: () => void activateUpdate() },
    onDismiss: () => {
      dismissed = waiting;
    },
  });
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
 * The worker in control changed. First install (clientsClaim): nothing to
 * say. Otherwise another tab took the update: this page still runs the old
 * build under the new worker — replace whatever toast it had with one that
 * just reloads.
 */
function onControllerChange() {
  if (!hadController) {
    hadController = true;
    return;
  }
  if (reloading) return;
  staleBuild = true;
  toast('Predit was updated', {
    id: TOAST_ID,
    description: 'Reload to finish.',
    duration: Infinity,
    action: { label: 'Reload', onClick: () => window.location.reload() },
  });
}
