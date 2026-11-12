'use client';

import { useEffect, useState } from 'react';
import { installMethod, OPEN_IN_SAFARI_HINT, shouldShowInstallBanner } from '@/lib/pwa/install';
import { useInstallPromptStore } from '@/store/install-prompt.store';
import { IosInstallSheet } from './ios-install-sheet';

/**
 * "Install the app" on phones: from the second visit or after the
 * first trade, until installed or put off with "Not now" (14 days). Android
 * opens the browser's install dialog; iOS, which has none, the Share → Add to
 * Home Screen guide. In an iOS in-app browser (Telegram, Instagram, a
 * wallet…), where neither exists, only the hint to open the page in Safari.
 * Also hosts the iOS guide for the account menu's item.
 */
export function InstallBanner() {
  const [mounted, setMounted] = useState(false);
  const ready = useInstallPromptStore((s) => s.ready);
  const platform = useInstallPromptStore((s) => s.platform);
  const standalone = useInstallPromptStore((s) => s.standalone);
  const canPrompt = useInstallPromptStore((s) => s.deferredPrompt !== null);
  const visits = useInstallPromptStore((s) => s.visits);
  const firstTradeDone = useInstallPromptStore((s) => s.firstTradeDone);
  const dismissedAt = useInstallPromptStore((s) => s.dismissedAt);
  const iosGuideOpen = useInstallPromptStore((s) => s.iosGuideOpen);
  const { promptInstall, dismiss, setIosGuideOpen } = useInstallPromptStore.getState();

  // The store reads browser state at load; render nothing until hydrated.
  useEffect(() => setMounted(true), []);

  const show =
    mounted &&
    ready &&
    shouldShowInstallBanner({
      platform,
      standalone,
      canPrompt,
      visits,
      firstTradeDone,
      dismissedAt,
      now: Date.now(),
    });
  const hintOnly = installMethod({ platform, standalone, canPrompt }) === 'open-in-safari';

  return (
    <>
      {show && (
        <div
          role="region"
          aria-label="Install the app"
          data-testid="install-banner"
          // Above the 30px ticker bar and the home indicator, clear of the
          // notch in landscape.
          style={{
            bottom: 'calc(38px + env(safe-area-inset-bottom))',
            left: 'calc(12px + env(safe-area-inset-left))',
            right: 'calc(12px + env(safe-area-inset-right))',
          }}
          className="fixed z-40 flex items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-lg"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- tiny static icon */}
          <img src="/icons/icon-192-maskable.png" alt="" className="size-9 shrink-0 rounded-md" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold leading-tight">Install Predit</p>
            <p
              className="truncate text-[11px] text-muted-foreground"
              data-testid={hintOnly ? 'install-banner-safari-hint' : undefined}
            >
              {hintOnly ? OPEN_IN_SAFARI_HINT : 'Full screen, one tap from your home screen'}
            </p>
          </div>
          {!hintOnly && (
            <button
              type="button"
              data-testid="install-banner-install"
              onClick={() => void promptInstall()}
              className="inline-flex h-7 shrink-0 items-center rounded-md bg-primary px-3 text-[10px] font-bold uppercase tracking-[0.06em] text-background transition-colors hover:bg-primary/85"
            >
              Install
            </button>
          )}
          <button
            type="button"
            data-testid="install-banner-dismiss"
            onClick={dismiss}
            className="inline-flex h-7 shrink-0 items-center rounded-md px-2 text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
          >
            Not now
          </button>
        </div>
      )}
      <IosInstallSheet open={iosGuideOpen} onOpenChange={setIosGuideOpen} />
    </>
  );
}
