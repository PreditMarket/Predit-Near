'use client';

import { useRef, type ReactNode } from 'react';
import { PanelLeftOpen, PanelRightOpen } from 'lucide-react';
import { cn } from '@/components/ui/utils';
import {
  HOME_COLUMN_WIDTHS,
  useHomeLayoutStore,
  type HomeColumnId,
} from '@/store/home-layout-store';

/** Pixels an arrow key moves a column's edge. */
const KEY_STEP = 16;

/**
 * One side column of the home: its content, or a 40px strip once folded,
 * with an edge to drag to its width. `edge` is the side facing the center:
 * where the handle sits, and which way dragging widens it. The grid item
 * stretches the row's height, so the edge runs the length of the page while
 * the column's own content stays sticky inside it.
 */
export function HomeColumn({
  id,
  title,
  edge,
  className,
  children,
}: Readonly<{
  id: HomeColumnId;
  /** Shown on the folded strip. */
  title: string;
  edge: 'left' | 'right';
  /** Where it shows: `hidden lg:block`. */
  className?: string;
  children: ReactNode;
}>) {
  const folded = useHomeLayoutStore((s) => s.folded[id]);
  const setFolded = useHomeLayoutStore((s) => s.setFolded);

  return (
    <div className={cn('relative min-w-0 self-stretch', className)} data-home-column={id}>
      {folded ? (
        <FoldedStrip title={title} edge={edge} onOpen={() => setFolded(id, false)} />
      ) : (
        <>
          {children}
          <ResizeHandle id={id} edge={edge} />
        </>
      )}
    </div>
  );
}

function FoldedStrip({
  title,
  edge,
  onOpen,
}: Readonly<{ title: string; edge: 'left' | 'right'; onOpen: () => void }>) {
  const Icon = edge === 'right' ? PanelLeftOpen : PanelRightOpen;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Show ${title}`}
      title={`Show ${title}`}
      className={cn(
        'sticky top-[calc(40px+var(--nav-y,0px))] flex h-[calc(var(--app-h)-70px-var(--banner-h,0px)-var(--nav-y,0px))] w-full cursor-pointer flex-col items-center gap-3 border-border/60 bg-background/62 py-3 text-muted-foreground transition-colors hover:bg-accent/40 hover:text-white',
        edge === 'right' ? 'border-r' : 'border-l',
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="[writing-mode:vertical-rl] [font-family:var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.14em]">
        {title}
      </span>
    </button>
  );
}

/** Drag (or arrow keys) to size the column; a double click puts it back. */
function ResizeHandle({ id, edge }: Readonly<{ id: HomeColumnId; edge: 'left' | 'right' }>) {
  const width = useHomeLayoutStore((s) => s.widths[id]);
  const setWidth = useHomeLayoutStore((s) => s.setWidth);
  const resetWidth = useHomeLayoutStore((s) => s.resetWidth);
  const drag = useRef<{ x: number; width: number } | null>(null);
  // Dragging away from the center widens the column.
  const sign = edge === 'right' ? 1 : -1;
  const { min, max } = HOME_COLUMN_WIDTHS[id];

  const end = () => {
    drag.current = null;
    document.body.style.removeProperty('cursor');
    document.body.style.removeProperty('user-select');
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize column"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={width}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, width };
        // The whole page, so the cursor doesn't flicker off the thin edge.
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        setWidth(id, drag.current.width + sign * (e.clientX - drag.current.x));
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onDoubleClick={() => resetWidth(id)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          const towardRight = e.key === 'ArrowRight' ? 1 : -1;
          setWidth(id, width + sign * towardRight * KEY_STEP);
        }
      }}
      className={cn(
        'group absolute inset-y-0 z-20 hidden w-2 cursor-col-resize touch-none outline-none md:block',
        edge === 'right' ? '-right-1' : '-left-1',
      )}
    >
      <span className="pointer-events-none mx-auto block h-full w-px bg-transparent transition-colors group-hover:bg-primary/60 group-focus-visible:bg-primary group-active:bg-primary" />
    </div>
  );
}
