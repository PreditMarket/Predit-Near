import * as Sentry from '@sentry/nextjs';
import { scrubPII } from '@/lib/sentry-pii';

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

if (ENABLE && DSN) {
  Sentry.init({
    dsn: DSN,
    environment: ENV,
    sendDefaultPii: false,
    tracesSampleRate: ENV === 'production' ? 0.2 : 1.0,
    enabled: ENV !== 'development',
    // No replayIntegration: Replay (with rrweb) is the heaviest script on every page load.
    integrations: [Sentry.browserTracingIntegration()],
    // Same-origin only: trace headers must not reach the NEAR RPCs.
    tracePropagationTargets: [/^\//],
    beforeSend(event, hint) {
      const err = hint?.originalException;

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

      return event;
    },
  });
}
