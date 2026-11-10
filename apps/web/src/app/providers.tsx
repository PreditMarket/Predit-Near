'use client';

import { ThemeProvider } from '@/providers/theme-provider';
import { ReactQueryProvider } from '@/providers/query-client-provider';
import { NearWalletBridge } from '@/providers/near-wallet-bridge';
import { Toaster } from '@/components/ui/sonner';
import { FundsDialogHost } from '@/components/funds/funds-dialog-host';
import { CreateMarketDialog } from '@/components/market/create-market-dialog';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ReactQueryProvider>
        <NearWalletBridge />
        {children}
        <Toaster />
        <FundsDialogHost />
        <CreateMarketDialog />
      </ReactQueryProvider>
    </ThemeProvider>
  );
}
