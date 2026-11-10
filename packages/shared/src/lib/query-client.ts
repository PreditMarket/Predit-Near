import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api-error';

/** Attempts after the first, by kind of failure. */
const RATE_LIMITED_RETRIES = 2;
const TRANSIENT_RETRIES = 1;
const MAX_BACKOFF_MS = 8_000;
/** Honour the server's `Retry-After`, within reason. */
const MAX_RETRY_AFTER_MS = 10_000;

/** HTTP status of a failed query, 0 when there was no response. */
function statusOf(error: unknown): number {
  if (error instanceof ApiError) {
    return error.status;
  }
  return 0;
}

/**
 * Default retry policy.
 *
 * TanStack's default (three retries at 1/2/4s, whatever the failure) retried
 * 4xx answers that will never change and fired straight back into a 429. A
 * rate limit gets two retries spaced by `Retry-After`; a 5xx or a network
 * failure gets one; any other 4xx none. Queries that set their own `retry`
 * keep it.
 */
export function shouldRetryQuery(failureCount: number, error: unknown) {
  const status = statusOf(error);
  if (status === 429) return failureCount < RATE_LIMITED_RETRIES;
  if (status >= 400 && status < 500) return false;
  return failureCount < TRANSIENT_RETRIES;
}

export function queryRetryDelay(failureCount: number, error: unknown) {
  const retryAfter = error instanceof ApiError ? error.retryAfterMs : null;
  if (retryAfter !== null && retryAfter > 0) {
    return Math.min(retryAfter, MAX_RETRY_AFTER_MS);
  }
  return Math.min(1_000 * 2 ** failureCount, MAX_BACKOFF_MS);
}

/**
 * Singleton QueryClient shared between the React provider tree and
 * non-React code (e.g. the Zustand auth store) so server-state reads
 * go through the same cache regardless of where they originate.
 *
 * Importing this module on the server gives a fresh client per
 * request via React's module-cache-per-request behaviour, which is
 * the correct semantics for Next.js App Router.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: shouldRetryQuery,
      retryDelay: queryRetryDelay,
    },
  },
});
