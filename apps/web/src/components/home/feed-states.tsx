
/** Placeholder rows while a feed tab loads; same shape as a post or a fill. */
export function FeedItemSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-col" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="grid grid-cols-[44px_1fr] gap-3 px-5 py-3.5 border-b border-border/60 animate-pulse"
        >
          <div className="w-10 h-10 rounded-md bg-muted" />
          <div className="flex flex-col gap-2">
            <div className="h-3 w-40 rounded bg-muted" />
            <div className="h-3 w-2/3 rounded bg-muted" />
            <div className="h-8 w-full rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}
