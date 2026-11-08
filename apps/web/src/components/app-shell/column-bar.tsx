'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/components/ui/utils';
import { useDragScroll } from '@/hooks/use-drag-scroll';

/**
 * The bar at the top of every column on the chat, swap and perps pages (and
 * the home's trade panel): one height and one hairline, so the line under
 * each column's title runs straight across the page and stays put moving
 * between pages.
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

/** The market's figures in one line under its bar, scrolling sideways when narrow. */
export function MetaStrip({
  children,
  className,
}: Readonly<{ children: ReactNode; className?: string }>) {
  const ref = useDragScroll<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={cn(
        'flex shrink-0 items-center gap-x-4 overflow-x-auto whitespace-nowrap border-b border-border/60 bg-muted/40 px-[14px] py-2 font-mono text-[10.5px] text-muted-foreground [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function MetaItem({
  label,
  value,
  className,
}: Readonly<{ label: string; value: ReactNode; className?: string }>) {
  return (
    <span className="shrink-0">
      <span>{label} </span>
      <strong className={cn('font-bold text-white tabular-nums', className)}>{value}</strong>
    </span>
  );
}
