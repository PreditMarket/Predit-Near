'use client';

import { useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ColumnBar, ColumnTitle } from '@/components/app-shell/column-bar';

import { getCategories, type Category } from '@/services/categories.service';
import MarketList from '@/components/market/market-list';
import type { PammMarketListItem } from '@/services/pamm-market.service';

/** Sticky header over the scrolling list: the page background, slightly see-through. */
const HEADER_BG = 'color-mix(in srgb, var(--background) 85%, transparent)';

/**
 * Predictions page (v2) — category rail and the market list.
 * Item list is the unchanged origin `MarketList`. The rail collapses; its
 * expand anchor lives in the center sticky topbar (mirrors the Home (`/`) pattern).
 */
export default function PredictionsPageV2({
  initialPammItems,
  initialPammHasMore,
}: {
  /** The server's first page of the default on-chain list — see MarketList. */
  initialPammItems?: PammMarketListItem[];
  initialPammHasMore?: boolean;
} = {}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeSlug = searchParams?.get('category') ?? null;
  const [leftCollapsed, setLeftCollapsed] = useState(false);

  const { data: categories = [] } = useQuery({
    queryKey: ['categories-list'],
    queryFn: getCategories,
    staleTime: 5 * 60_000,
  });

  // Category rail drives MarketList via the `?category=<slug>` URL param,
  // handed down as `categorySlug` — MarketList reads the URL itself only on
  // mount. A plain history push, not `router.push`: the router would re-run
  // the server page (and flash the (app) loading skeleton) per click, while
  // Next keeps `useSearchParams` in sync with native pushState for free —
  // the list refetches client-side and back/forward still walk the filters.
  const setCategorySlug = (slug: string | null) => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (slug) params.set('category', slug);
    else params.delete('category');
    const q = params.toString();
    window.history.pushState(null, '', q ? `${pathname}?${q}` : pathname);
  };

  const cols = leftCollapsed ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-[240px_1fr]';

  return (
    // A fixed-height shell like home, chat and the trade pages: only the
    // center column scrolls, so the rails never move with the list (and the
    // top nav, which hides on page scroll, stays put).
    <div className="h-[calc(var(--app-h)-70px-var(--mobile-nav-h)-var(--banner-h,0px))] bg-background text-foreground">
      <div className={`grid h-full ${cols}`}>
        {!leftCollapsed && (
          <CategoryRail
            categories={categories}
            activeSlug={activeSlug}
            onChange={setCategorySlug}
            onCollapse={() => setLeftCollapsed(true)}
          />
        )}

        {/* Center — origin MarketList's own sticky tab strip becomes the
            center menu. CSS vars pin it to the top of this column (its own
            scroller) and dress it in /markets v2 glass tokens. `bare` mode on MarketPageLayout
            (see MarketList `hideCategoryTabs` prop) drops the outer
            content chrome + max-width wrap so the tabs sit flush inside
            the 3-col shell. */}
        <main
          className={[
            'min-w-0 min-h-0 overflow-y-auto flex flex-col relative',
            '[&_.card-order]:!rounded-[10px]',
            // Tighter grid gap (mockup uses 12px, fe defaults 16px)
            '[&_.grid.gap-4]:!gap-3',
          ].join(' ')}
          style={{
            // MarketSubHeader (uses these vars) is not the active header
            // here — MarketList renders MarketPageLayout instead — but the
            // vars are cheap and harmless.
            ['--sub-header-top' as string]: '0px',
            ['--sub-header-bg' as string]: HEADER_BG,
            ['--sub-header-border' as string]: 'var(--border)',
            // MarketPageLayout sticky header — pinned to the top of this
            // column, which scrolls on its own (fallback 4rem is for the
            // standalone full-page layout).
            ['--mpl-header-top' as string]: '0px',
            ['--mpl-header-bg' as string]: HEADER_BG,
            ['--mpl-header-border' as string]: 'var(--border)',
          }}
        >
          {/* The category rail is hidden below md — filter from a chip strip. */}
          <MobileCategoryStrip
            categories={categories}
            activeSlug={activeSlug}
            onChange={setCategorySlug}
          />
          <MarketList
            isFromMarketPage
            initialPammItems={initialPammItems}
            initialPammHasMore={initialPammHasMore}
            hideCategoryTabs
            categorySlug={activeSlug}
            gridColsClassName={
              leftCollapsed
                ? 'grid-cols-1 md:grid-cols-3 xl:grid-cols-4'
                : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
            }
            headerLeadingSlot={
              leftCollapsed ? (
                <RailExpandChip
                  side="left"
                  label="Categories"
                  onClick={() => setLeftCollapsed(false)}
                />
              ) : null
            }
          />
        </main>
      </div>
    </div>
  );
}

// ── Rail-expand chip — embedded INSIDE the sticky center-head via slots ────

function RailExpandChip({
  side,
  label,
  onClick,
}: {
  side: 'left' | 'right';
  label: string;
  onClick: () => void;
}) {
  const Icon = side === 'left' ? ChevronRight : ChevronLeft;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Expand ${label}`}
      title={`Expand ${label}`}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-muted/30 text-muted-foreground hover:text-foreground hover:border-border/80 cursor-pointer transition-colors"
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  );
}

// ── Left rail (categories nav) ─────────────────────────────────────────

function CategoryRail({
  categories,
  activeSlug,
  onChange,
  onCollapse,
}: {
  categories: Category[];
  activeSlug: string | null;
  onChange: (slug: string | null) => void;
  onCollapse: () => void;
}) {
  return (
    <aside
      className="min-h-0 overflow-y-auto flex flex-col border-r border-white/6 bg-background/62 backdrop-blur-[20px] backdrop-saturate-[160%] hidden md:flex"
      aria-label="Categories"
    >
      <ColumnBar className="justify-between">
        <ColumnTitle>Categories</ColumnTitle>
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Collapse categories"
          title="Collapse"
          className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-[5px] text-white/55 hover:text-white hover:bg-white/6 cursor-pointer transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
      </ColumnBar>
      <nav className="flex-1 overflow-y-auto flex flex-col px-1.5 py-2">
        <CategoryLink
          active={activeSlug == null}
          onClick={() => onChange(null)}
          label="All markets"
        />
        {categories.map((c) => (
          <CategoryLink
            key={c.id}
            active={activeSlug === c.slug}
            onClick={() => onChange(c.slug)}
            label={c.name}
            color={c.color ?? undefined}
          />
        ))}
      </nav>
    </aside>
  );
}

function MobileCategoryStrip({
  categories,
  activeSlug,
  onChange,
}: {
  categories: Category[];
  activeSlug: string | null;
  onChange: (slug: string | null) => void;
}) {
  const chip = (active: boolean) =>
    `inline-flex shrink-0 items-center gap-1.5 h-9 px-3.5 rounded-full border text-[13px] whitespace-nowrap transition-colors ${
      active
        ? 'border-white/14 bg-white/8 text-white'
        : 'border-white/8 text-white/65'
    }`;
  return (
    <nav
      aria-label="Categories"
      // shrink-0: a flex item in the fixed-height column, and overflow-x
      // drops its min height to 0 — it got squeezed under the tab strip.
      className="md:hidden shrink-0 flex gap-1.5 overflow-x-auto px-3 py-2 border-b border-white/6 scrollbar-hide"
    >
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`touch-hit ${chip(activeSlug == null)}`}
      >
        All markets
      </button>
      {categories.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onChange(c.slug)}
          className={`touch-hit ${chip(activeSlug === c.slug)}`}
        >
          {c.color && (
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: c.color }}
            />
          )}
          {c.name}
        </button>
      ))}
    </nav>
  );
}

function CategoryLink({
  active,
  onClick,
  label,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-2.5 py-2 rounded-md text-left cursor-pointer transition-colors text-[13px] ${
        active
          ? 'bg-white/5 text-white'
          : 'text-white/65 hover:text-white hover:bg-white/3'
      }`}
    >
      {color && (
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: color }}
        />
      )}
      <span className="flex-1 truncate">{label}</span>
    </button>
  );
}
