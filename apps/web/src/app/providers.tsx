'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { ThemeProvider } from '@/providers/theme-provider';
import { ReactQueryProvider } from '@/providers/query-client-provider';
import { WalletProviders } from '@/providers/wallet-providers';
import { LazyPrivyIsland } from '@/providers/lazy-privy-island';
import { PrivyPerpsAgentSigner } from '@/providers/privy-perps-agent-signer';
import { OAuthCallbackProvider } from '@/providers/oauth-callback-provider';
import { DailyLoginBonusProvider } from '@/providers/daily-login-bonus-provider';
import { FirstBetBonusProvider } from '@/providers/first-bet-bonus-provider';
import { StoreHydrator } from '@/providers/store-hydrator';
import { PostHogProvider } from '@/providers/posthog-provider';
import { AutoApplyInviteCode } from '@/components/invite-code/auto-apply-invite-code';
import { V2SignInDialog } from '@/components/v2/v2-sign-in-dialog';
import { V2SignInRedirect } from '@/components/v2/v2-sign-in-redirect';
import { Toaster } from '@/components/ui/sonner';
import { useGeoStore } from '@/store/geo-store';
import RestrictedPage from '@/page-components/restricted-page';
import { useReportDialogStore } from '@/store/report-dialog.store';
import { useOpenedOnce } from '@/hooks/use-opened-once';

// Opened from an error screen only: fetched the first time one asks for it.
const ReportDialogChunk = dynamic(
  () => import('@/components/error/report-dialog').then((m) => m.ReportDialog),
  { ssr: false },
);
function ReportDialog() {
  const opened = useOpenedOnce(useReportDialogStore((s) => s.isOpen));
  return opened ? <ReportDialogChunk /> : null;
}

// /restricted already is the notice (with the server's list); swapping it for
// GeoGate's copy would only re-render the same page.
const GEO_EXEMPT_PATHS = ['/privacy-policy', '/terms-of-service', '/restricted'];

function GeoGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const restricted = useGeoStore((s) => s.restricted);
  if (restricted && !GEO_EXEMPT_PATHS.includes(pathname ?? '')) {
    return <RestrictedPage />;
  }
  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ReactQueryProvider>
        {/* No <PrivyProvider> around the app: Privy loads on demand, inside
            WalletProviders (see LazyPrivyIsland). */}
        <WalletProviders privy={<LazyPrivyIsland />}>
          <PrivyPerpsAgentSigner>
            <StoreHydrator />
            <PostHogProvider />
            <OAuthCallbackProvider />
            {/* Outside GeoGate, which short-circuits its children: a referral
                code must be captured on every route, including the ones that
                sit outside the (app) group (/s, /leaderboard, /quests, …). */}
            <AutoApplyInviteCode />
            <DailyLoginBonusProvider />
            <FirstBetBonusProvider />
            <GeoGate>{children}</GeoGate>
            {/* This site signs in with V2 only. The popup is mounted site-wide,
                and every existing "please sign in" prompt (app-shell's
                walletConnectOpen) is routed to it. */}
            <V2SignInDialog />
            <V2SignInRedirect />
            <Toaster />
            <ReportDialog />
          </PrivyPerpsAgentSigner>
        </WalletProviders>
      </ReactQueryProvider>
    </ThemeProvider>
  );
}
