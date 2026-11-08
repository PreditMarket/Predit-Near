import type { ComponentProps, ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/components/ui/utils';

export interface StatTileProps extends Omit<ComponentProps<'div'>, 'children'> {
  label: ReactNode;
  /** The headline figure — usually a `Money` or `PnlValue`. */
  value: ReactNode;
  /** Small muted lines under the figure. */
  sub?: ReactNode;
  /** Shows a skeleton in place of `value` and hides `sub`. */
  loading?: boolean;
}

/**
 * A labelled headline figure (the portfolio tile look): mono uppercase label,
 * 18px bold tabular value, optional muted sub-lines.
 */
export function StatTile({ label, value, sub, loading, className, ...rest }: StatTileProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 px-4 py-3 rounded-lg bg-background/40 backdrop-blur-sm border border-border/50 min-w-0',
        className,
      )}
      {...rest}
    >
      <span className="font-mono text-[9.5px] font-medium tracking-[0.2em] uppercase text-muted-foreground truncate">
        {label}
      </span>
      {loading ? (
        <Skeleton className="h-[18px] w-20" />
      ) : (
        <div className="font-mono text-[16px] sm:text-[18px] font-bold tracking-[-0.01em] tabular-nums leading-none text-foreground truncate">
          {value}
        </div>
      )}
      {!loading && sub && (
        <div className="flex flex-col gap-1 font-mono text-[10px] text-muted-foreground min-w-0 [&>*]:truncate">
          {sub}
        </div>
      )}
    </div>
  );
}
