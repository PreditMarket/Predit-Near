'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/components/ui/utils';

export interface SegmentedTabOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Shown muted after the label as `·12`; `null`/`undefined` hides it. */
  count?: number | null;
}

export interface SegmentedTabsProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedTabOption<T>[];
  /**
   * Keep the selection in this search param (`?tab=fills`) with
   * `history.replaceState` — no navigation, no server round trip. On mount a
   * valid value already in the URL is passed to `onChange`. To avoid a one
   * frame flash of the default, seed `value` from `useSearchParams` too.
   */
  urlParam?: string;
  /** Value written as "no param" so the default keeps a clean URL. */
  urlDefault?: T;
  /** `pill` (boxed, for filters and toggles) or `text` (page-level tabs). */
  variant?: 'pill' | 'text';
  className?: string;
  'data-testid'?: string;
}

const ITEM_CLASS = {
  pill: {
    base: 'h-7 px-2.5 rounded-md border font-mono text-[11px] font-bold tracking-[0.04em]',
    active: 'border-border bg-muted/60 text-foreground',
    idle: 'border-transparent text-muted-foreground hover:text-foreground',
  },
  text: {
    base: 'text-[14px] font-medium',
    active: 'text-foreground font-bold',
    idle: 'text-muted-foreground hover:text-foreground',
  },
} as const;

/** One row of mutually exclusive tabs, optionally mirrored in the URL. */
export function SegmentedTabs<T extends string>({
  value,
  onChange,
  options,
  urlParam,
  urlDefault,
  variant = 'pill',
  className,
  'data-testid': testId,
}: SegmentedTabsProps<T>) {
  // Read once on mount; the latest props without re-running the effect.
  const latest = useRef({ value, onChange, options });
  latest.current = { value, onChange, options };

  useEffect(() => {
    if (!urlParam) return;
    const fromUrl = new URLSearchParams(window.location.search).get(urlParam);
    const { value: current, onChange: change, options: opts } = latest.current;
    const match = opts.find((o) => o.value === fromUrl);
    if (match && match.value !== current) change(match.value);
  }, [urlParam]);

  const select = (next: T) => {
    if (urlParam) {
      const params = new URLSearchParams(window.location.search);
      if (next === urlDefault) params.delete(urlParam);
      else params.set(urlParam, next);
      const qs = params.toString();
      // Same approach as the leaders filters: Next keeps useSearchParams in
      // sync with history.replaceState.
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`,
      );
    }
    if (next !== value) onChange(next);
  };

  const styles = ITEM_CLASS[variant];
  return (
    <div
      role="tablist"
      data-testid={testId}
      className={cn(
        'flex items-center overflow-x-auto scrollbar-hide',
        variant === 'pill' ? 'gap-1' : 'gap-5',
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            data-state={active ? 'active' : 'inactive'}
            onClick={() => select(o.value)}
            className={cn(
              'shrink-0 whitespace-nowrap transition-colors',
              styles.base,
              active ? styles.active : styles.idle,
            )}
          >
            {o.label}
            {o.count !== null && o.count !== undefined && (
              <span className="ml-1 font-mono text-[11px] font-normal text-muted-foreground">
                ·{o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
