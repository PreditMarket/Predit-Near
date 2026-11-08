import type { Metadata } from 'next';
import { OfflineActions } from '@/components/pwa/offline-actions';

export const metadata: Metadata = {
  title: 'Offline',
  robots: { index: false, follow: false },
};

// Built once and precached by the service worker (next.config.ts), which
// serves it for any page load that fails with no cached copy to fall back on.
export const dynamic = 'force-static';

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col bg-background pt-[env(safe-area-inset-top)] text-foreground">
      <header className="flex h-10 items-center gap-1.5 border-b border-border px-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- precached as is; no image optimizer offline */}
        <img src="/logo-MarkWhite.svg" alt="" className="h-[18px] w-auto" />
        <span className="text-[13px] font-extrabold uppercase tracking-[0.02em] leading-none">
          Predit
        </span>
      </header>
      <section
        data-testid="offline-shell"
        className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-3 px-6 text-center"
      >
        <h1 className="text-lg font-semibold">You&apos;re offline</h1>
        <p className="text-sm text-muted-foreground">
          This page needs a connection. Prices and balances are never shown from
          a saved copy — reconnect to trade.
        </p>
        <OfflineActions />
      </section>
    </main>
  );
}
