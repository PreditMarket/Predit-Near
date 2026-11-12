import * as Sentry from '@sentry/nextjs';
import { scrubPII } from '@/lib/sentry-pii';

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
    beforeSend(event) {
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
