import * as Sentry from '@sentry/nextjs';
import { scrubPII } from '@/lib/sentry-pii';
import { ApiError } from '@/lib/api-error';

function isUserRejected(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: number; message?: string };
  if (e.code === 4001) return true;
  const msg = (e.message ?? '').toLowerCase();
  return msg.includes('user rejected') || msg.includes('rejected the request');
}

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
const ENABLE = process.env.NEXT_PUBLIC_ENABLE_SENTRY === 'true';
const ENV = process.env.NODE_ENV;
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();

const tracePropagationTargets: (string | RegExp)[] = [/^\//];
if (API_BASE_URL) {
  try {
    tracePropagationTargets.push(new URL(API_BASE_URL).host);
  } catch {
    // Malformed URL — fall back to same-origin propagation only.
  }
}

if (ENABLE && DSN) {
  Sentry.init({
    dsn: DSN,
    environment: ENV,
    sendDefaultPii: false,
    tracesSampleRate: ENV === 'production' ? 0.2 : 1.0,
    enabled: ENV !== 'development',
    // No replayIntegration: PostHog already records sessions, and Replay
    // (with rrweb) was the heaviest script parsed on every page load.
    integrations: [Sentry.browserTracingIntegration()],
    tracePropagationTargets,
    beforeSend(event, hint) {
      const err = hint?.originalException;

      // Auth errors (401/403) are expected user flows — session expired or
      // permission denied. They are handled in the UI; drop from Sentry.
      if (err instanceof ApiError && err.category === 'auth') {
        return null;
      }

      // Wallet cancellations are user-initiated, not bugs — drop from Sentry.
      if (isUserRejected(err)) {
        return null;
      }

      // Scrub PII from request headers/data/cookies, user, extra, contexts
      if (event.request) {
        event.request = scrubPII(event.request) as typeof event.request;
      }
      if (event.user) {
        event.user = scrubPII(event.user) as typeof event.user;
      }
      if (event.extra) {
        event.extra = scrubPII(event.extra) as typeof event.extra;
      }
      if (event.contexts) {
        event.contexts = scrubPII(event.contexts) as typeof event.contexts;
      }

      // Tag 5xx ApiErrors with errorCode for Sentry filtering/alerting
      if (err instanceof ApiError && (err.category === 'system' || err.category === 'external')) {
        event.tags = { ...event.tags, errorCode: err.code };
      }

      return event;
    },
  });
}
