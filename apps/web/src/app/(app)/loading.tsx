import { Skeleton } from '@/components/ui/skeleton';

/**
 * Default fallback for routes inside the (app) group. Streams in while the
 * server renders the page so the user gets immediate visual feedback on nav.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-[1280px] px-6 md:px-12 py-6 space-y-4">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    </div>
  );
}
