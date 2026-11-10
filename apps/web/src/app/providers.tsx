'use client';

import { ThemeProvider } from '@/providers/theme-provider';
import { ReactQueryProvider } from '@/providers/query-client-provider';
import { NearWalletBridge } from '@/providers/near-wallet-bridge';
import { Toaster } from '@/components/ui/sonner';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ReactQueryProvider>
        <NearWalletBridge />
        {children}
        <Toaster />
      </ReactQueryProvider>
    </ThemeProvider>
  );
}
