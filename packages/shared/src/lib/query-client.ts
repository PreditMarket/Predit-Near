import { QueryClient } from '@tanstack/react-query';

const MAX_BACKOFF_MS = 8_000;

/** One shared client; the contract reads are cheap, so one retry with backoff is enough. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
      retryDelay: (failureCount) => Math.min(1_000 * 2 ** failureCount, MAX_BACKOFF_MS),
    },
  },
});
