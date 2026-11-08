'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/query-client';

export function ReactQueryProvider({ children }: { children: React.ReactNode }) {
  // Use the singleton from src/lib/query-client.ts so non-React
  // callers (Zustand auth store, ad-hoc service helpers) read and
  // mutate the same cache as the component tree.
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
