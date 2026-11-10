'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/components/ui/utils';

/**
 * The bar at the top of a page column: one height and one hairline, so the
 * line under each column's title runs straight across the page.
 */
export function ColumnBar({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex h-[44px] shrink-0 items-center gap-3 border-b border-border/60 px-4',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/** A column's name in its bar: "Chats", "Markets", "Tokens". */
export function ColumnTitle({
  children,
  className,
}: Readonly<{ children: ReactNode; className?: string }>) {
  return (
    <span
      className={cn(
        '[font-family:var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.14em] text-white/85',
        className,
      )}
    >
      {children}
    </span>
  );
}
