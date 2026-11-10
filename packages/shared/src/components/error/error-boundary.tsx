'use client';

import * as React from 'react';
import * as Sentry from '@sentry/nextjs';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api-error';

interface ErrorBoundaryState {
  hasError: boolean;
  eventId: string | null;
  errorId: string | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, eventId: null, errorId: null };
  }

  static getDerivedStateFromError(): Partial<ErrorBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const eventId = Sentry.captureException(error, {
      tags: { boundary: 'app' },
      extra: { componentStack: info.componentStack },
    });

    const errorId = error instanceof ApiError ? error.errorId : null;
    this.setState({
      eventId: eventId ?? Sentry.lastEventId() ?? null,
      errorId,
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback;
    }

    const { eventId, errorId } = this.state;
    const displayId = errorId ?? eventId;

    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-6 p-8 text-center">
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold text-foreground">Something went wrong</h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            An unexpected error occurred. Our team has been notified.
          </p>
          {displayId && (
            <p className="text-xs text-muted-foreground font-mono mt-1">
              Error ID: {displayId}
            </p>
          )}
        </div>

        <div className="flex gap-3">
          <Button onClick={this.handleReload}>
            Reload page
          </Button>
        </div>
      </div>
    );
  }
}
