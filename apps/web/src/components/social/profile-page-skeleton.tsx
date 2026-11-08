import { Skeleton } from '@/components/ui/skeleton';

/**
 * `/u/@handle` before its data: header, stats row and trades in the same
 * boxes the page fills, so nothing jumps when it lands. Also the route's
 * `loading.tsx`.
 */
export function ProfilePageSkeleton() {
  return (
    <div className="mx-auto max-w-[1280px] w-full px-4 md:px-6 py-6" aria-busy>
      <div className="flex items-start gap-4 pt-6 pb-6">
        <Skeleton className="size-16 shrink-0" />
        <div className="flex flex-col gap-2 pt-1">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3.5 w-56" />
          <Skeleton className="h-3.5 w-36" />
        </div>
      </div>
      <div className="flex gap-2 overflow-hidden sm:grid sm:grid-cols-4 sm:gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[104px] min-w-[150px] shrink-0 rounded-lg sm:min-w-0" />
        ))}
      </div>
      <Skeleton className="mt-6 mb-3 h-4 w-28" />
      <div className="space-y-2 pt-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    </div>
  );
}
