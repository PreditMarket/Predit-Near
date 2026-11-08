import * as Sentry from '@sentry/nextjs';

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
const ENABLE = process.env.NEXT_PUBLIC_ENABLE_SENTRY === 'true';
const ENV = process.env.NODE_ENV;

if (ENABLE && DSN) {
  Sentry.init({ dsn: DSN, environment: ENV, enabled: ENV !== 'development' });
}
