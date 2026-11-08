'use client';

import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/components/ui/utils';

export interface ResponsiveTableColumn<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Extra classes on this column's header and cells. */
  className?: string;
  align?: 'left' | 'right' | 'center';
  /** CSS grid track, e.g. `140px` or `minmax(0,2fr)`. Default `minmax(0,1fr)`. */
  width?: string;
}

export interface ResponsiveTableProps<T> {
  rows: T[];
  columns: ResponsiveTableColumn<T>[];
  /** The row as a card, for phones (below `md`). */
  renderCard: (row: T) => ReactNode;
  getRowKey: (row: T) => string;
  /** With no rows yet, shows `skeletonRows` placeholders instead of `empty`. */
  loading?: boolean;
  skeletonRows?: number;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  className?: string;
  /** `data-testid` on each desktop row / each card. */
  rowTestId?: string;
  cardTestId?: string;
}

/**
 * A click on the row itself: not on a link or button inside it (they do their
 * own thing), and not one bubbling up the React tree from a portal (a menu or
 * dialog opened from the row), whose target isn't in the row at all.
 */
function isRowClick(e: MouseEvent<HTMLElement>): boolean {
  const target = e.target as Element;
  if (!e.currentTarget.contains(target)) return false;
  const control = target.closest('a, button, input, select, textarea, label');
  return !control || !e.currentTarget.contains(control);
}

const ALIGN_CLASS = {
  left: 'text-left justify-start',
  right: 'text-right justify-end',
  center: 'text-center justify-center',
} as const;

/**
 * A grid table from `md` up and a list of cards below it. Both are rendered
 * and one is hidden with CSS, so there is no layout flash on hydration (and a
 * row's test id appears once per layout).
 */
export function ResponsiveTable<T>({
  rows,
  columns,
  renderCard,
  getRowKey,
  loading = false,
  skeletonRows = 5,
  empty,
  onRowClick,
  className,
  rowTestId,
  cardTestId,
}: ResponsiveTableProps<T>) {
  // Grid tracks vary per table, so they cannot be static Tailwind classes.
  const gridTemplateColumns = columns.map((c) => c.width ?? 'minmax(0,1fr)').join(' ');
  const showSkeleton = loading && rows.length === 0;

  if (!showSkeleton && rows.length === 0) {
    return (
      <div className={cn('py-12 text-center font-mono text-sm text-muted-foreground', className)}>
        {empty ?? 'Nothing here yet.'}
      </div>
    );
  }

  const clickProps = (row: T) =>
    onRowClick
      ? {
          tabIndex: 0,
          onClick: (e: MouseEvent<HTMLElement>) => {
            if (isRowClick(e)) onRowClick(row);
          },
          onKeyDown: (e: KeyboardEvent) => {
            if (e.target !== e.currentTarget) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onRowClick(row);
            }
          },
        }
      : {};
  const clickable = onRowClick ? 'cursor-pointer hover:bg-muted/30 transition-colors' : '';

  return (
    <div className={className}>
      <div role="table" className="hidden md:block text-[12.5px]">
        <div
          role="row"
          className="grid gap-3 font-mono text-[9.5px] font-medium tracking-[0.18em] uppercase text-muted-foreground"
          style={{ gridTemplateColumns }}
        >
          {columns.map((c) => (
            <div
              key={c.key}
              role="columnheader"
              className={cn('py-2.5 flex items-center min-w-0', ALIGN_CLASS[c.align ?? 'left'], c.className)}
            >
              {c.header}
            </div>
          ))}
        </div>
        {showSkeleton
          ? Array.from({ length: skeletonRows }, (_, i) => (
              <div
                key={i}
                role="row"
                className="grid gap-3 border-t border-border/60"
                style={{ gridTemplateColumns }}
              >
                {columns.map((c) => (
                  <div
                    key={c.key}
                    role="cell"
                    className={cn('py-3 flex items-center', ALIGN_CLASS[c.align ?? 'left'])}
                  >
                    <Skeleton className="h-3.5 w-3/5" />
                  </div>
                ))}
              </div>
            ))
          : rows.map((row) => (
              <div
                key={getRowKey(row)}
                role="row"
                data-testid={rowTestId}
                className={cn('grid gap-3 border-t border-border/60', clickable)}
                style={{ gridTemplateColumns }}
                {...clickProps(row)}
              >
                {columns.map((c) => (
                  <div
                    key={c.key}
                    role="cell"
                    className={cn(
                      'py-2.5 flex items-center min-w-0',
                      ALIGN_CLASS[c.align ?? 'left'],
                      c.className,
                    )}
                  >
                    {c.cell(row)}
                  </div>
                ))}
              </div>
            ))}
      </div>

      <ul className="md:hidden text-[12.5px]">
        {showSkeleton
          ? Array.from({ length: skeletonRows }, (_, i) => (
              <li key={i} className="py-3 border-t border-border/60 first:border-t-0">
                <Skeleton className="h-11 rounded-md" />
              </li>
            ))
          : rows.map((row) => (
              <li
                key={getRowKey(row)}
                data-testid={cardTestId}
                className={cn('py-3 border-t border-border/60 first:border-t-0', clickable)}
                {...clickProps(row)}
              >
                {renderCard(row)}
              </li>
            ))}
      </ul>
    </div>
  );
}
