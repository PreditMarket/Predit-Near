'use client';

import { CenterFeed } from './center-feed';

/** Home is the social feed: each post, its markets, and predicting on them. */
export function HomeShell() {
  return (
    <div className="mx-auto w-full max-w-[680px] min-h-[calc(var(--app-h)-40px-var(--mobile-nav-h)-var(--banner-h,0px))] border-x border-border/60 bg-background">
      <CenterFeed />
    </div>
  );
}
