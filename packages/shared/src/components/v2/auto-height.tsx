'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/components/ui/utils';

/**
 * Animates its own height to fit its content.
 *
 * Tabs inside a modal swap content of different heights; without this the
 * modal snaps to each new size. A ResizeObserver tracks the content and the
 * outer box eases to it, so a tab switch, a spinner turning into a QR card or
 * a line of help text wrapping all grow and shrink smoothly.
 *
 * The first measurement is applied without a transition (height starts as
 * `auto`), so opening doesn't animate from zero. The 4px inset keeps focus
 * rings at the edges from being clipped by the `overflow: hidden` the height
 * animation needs. Children are laid out in a grid that inherits the parent's
 * `gap`, so dropping this into a `grid gap-4` dialog keeps its spacing.
 */
export function AutoHeight({
  children,
  className,
}: Readonly<{ children: ReactNode; className?: string }>) {
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = inner.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={cn(
        '-m-1 overflow-hidden [gap:inherit] motion-safe:transition-[height] motion-safe:duration-200 motion-safe:ease-out',
        className,
      )}
      // Dynamic by nature; `null` until measured keeps the first paint natural.
      style={height === null ? undefined : { height }}
    >
      <div ref={inner} className="grid p-1 [gap:inherit]">
        {children}
      </div>
    </div>
  );
}
