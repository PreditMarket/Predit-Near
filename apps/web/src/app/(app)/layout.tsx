import { TopNav } from '@/components/top-nav';
import { AppDialogsHost } from '@/components/app-shell/dialogs-host';
import { FundsDialogHost } from '@/components/app-shell/funds-dialog-host';
import { MobileBottomNav } from '@/components/nav/mobile-bottom-nav';
import { OfflineDataBanner } from '@/components/pwa/offline-data-banner';

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // Installed on iOS the page runs edge to edge (viewportFit 'cover' +
    // 'black-translucent'): under the status bar, beside the notch in
    // landscape. Each inset is 0 everywhere else. The bottom one is the
    // BottomBar's to pad — it's the last thing on screen. Height is
    // --app-h, not h-dvh: see globals.css.
    <div className="flex flex-col h-(--app-h) bg-background overflow-hidden pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      {/* A column, so the page (template.tsx) gets exactly the height left
          under the nav: rail pages then fit the screen and leave nothing to
          scroll — before, nav + a 100%-tall page always overflowed by the
          nav's 40px, and any scrollIntoView/focus slid the whole UI up. */}
      <div id="scroll-root" className="flex flex-1 flex-col overflow-x-hidden overflow-y-auto">
        <TopNav />
        <OfflineDataBanner />
        {children}
      </div>
      <MobileBottomNav />
      <AppDialogsHost />
      {/* Every deposit, withdraw and transfer dialog: opened through useFundsDialog. */}
      <FundsDialogHost />
    </div>
  );
}
