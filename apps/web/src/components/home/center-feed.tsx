'use client';

import { usePostsFeed } from '@/hooks/use-posts-feed';
import { FeedPost } from './feed-post';
import { FeedItemSkeleton } from './feed-states';

/** The feed of posts, newest first. */
export function CenterFeed() {
  const feed = usePostsFeed({});
  const isEmpty = !feed.isLoading && feed.items.length === 0;

  return (
    <div className="flex flex-col min-w-0">
      <div className="sticky top-[calc(40px+var(--nav-y,0px))] z-10 flex h-[44px] items-center border-b border-border/60 bg-background/68 px-5 text-[14px] font-bold text-white backdrop-blur-[24px] backdrop-saturate-[180%]">
        Feed
      </div>

      {feed.isLoading && <FeedItemSkeleton count={4} />}
      {feed.isError && !feed.isLoading && (
        <div className="px-5 py-16 text-center text-[13px] text-muted-foreground">
          Failed to load feed.{' '}
          <button type="button" onClick={() => feed.refetch()} className="text-primary underline">
            Retry
          </button>
        </div>
      )}
      {isEmpty && !feed.isError && (
        <div className="px-5 py-16 text-center text-[13px] text-muted-foreground">No posts yet.</div>
      )}
      {feed.items.map((item) => (
        <FeedPost key={item.id} item={item} />
      ))}
      {feed.hasNextPage && (
        <button
          type="button"
          onClick={() => feed.fetchNextPage()}
          disabled={feed.isFetchingNextPage}
          className="mx-5 my-4 rounded-md border border-border py-2 text-[12px] text-foreground/80 hover:bg-muted/60 disabled:opacity-40"
        >
          {feed.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}
