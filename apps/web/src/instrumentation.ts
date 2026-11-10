import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
    // The resolve agent runs inside the web server, so a deployment has one process to keep alive.
    const { startResolveAgent } = await import('@/lib/resolve/agent');
    startResolveAgent();
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
