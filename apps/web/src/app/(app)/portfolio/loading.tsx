import { Skeleton } from '@/components/ui/skeleton';

const TILE = 'rounded-lg border border-border/50 bg-background/40';

/**
 * `/portfolio`'s layout before the client page mounts: identity line, the
 * value tile beside the two stats, then the tab bar and rows.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-[1280px] w-full px-4 md:px-6 py-6" aria-busy>
      <div className="flex items-center gap-3 pt-4">
        <Skeleton className="size-10 shrink-0" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-52" />
        </div>
      </div>

      <div className="grid gap-3 pt-5 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className={`${TILE} flex flex-col gap-3 px-4 py-3`}>
          <Skeleton className="h-7 w-48" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-[62px] rounded-lg" />
            ))}
          </div>
          <div className="flex flex-col gap-2.5 border-t border-border/60 pt-2.5">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
          <Skeleton className="h-[86px] rounded-lg" />
          <Skeleton className="h-[86px] rounded-lg" />
        </div>
      </div>

      <div className="mt-6 pb-3 border-b border-border flex items-center gap-5">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-5 w-16" />
        ))}
      </div>
      <div className="mt-4 space-y-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    </div>
  );
}
