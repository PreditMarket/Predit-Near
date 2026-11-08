'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <div style={{ padding: 24, fontFamily: 'system-ui' }}>
          <h2>Something went wrong</h2>
          <p>An unexpected error occurred. The team has been notified.</p>
        </div>
      </body>
    </html>
  );
}
