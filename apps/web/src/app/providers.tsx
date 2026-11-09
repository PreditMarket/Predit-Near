'use client';

import dynamic from 'next/dynamic';
import { ThemeProvider } from '@/providers/theme-provider';
import { ReactQueryProvider } from '@/providers/query-client-provider';
import { NearWalletBridge } from '@/providers/near-wallet-bridge';
import { Toaster } from '@/components/ui/sonner';
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

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ReactQueryProvider>
        <NearWalletBridge />
        {children}
        <Toaster />
        <ReportDialog />
      </ReactQueryProvider>
    </ThemeProvider>
  );
}
