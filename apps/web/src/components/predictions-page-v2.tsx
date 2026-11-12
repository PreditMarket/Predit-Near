'use client';

import { useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ColumnBar, ColumnTitle } from '@/components/app-shell/column-bar';

import { CATEGORIES as categories, type Category } from '@/services/categories.service';
import { NearMarketList } from '@/components/markets/near-market-list';

/**
 * Markets page: category rail and the market list. The rail collapses; its
 * expand anchor lives in the center sticky topbar (mirrors the Home (`/`) pattern).
 */
export default function PredictionsPageV2() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeSlug = searchParams?.get('category') ?? null;
  const [leftCollapsed, setLeftCollapsed] = useState(false);

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

        <main
          className={[
            'min-w-0 min-h-0 overflow-y-auto flex flex-col relative',
          ].join(' ')}
        >
          {/* The category rail is hidden below md — filter from a chip strip. */}
          <MobileCategoryStrip
            categories={categories}
            activeSlug={activeSlug}
            onChange={setCategorySlug}
          />
          <NearMarketList
            categorySlug={activeSlug}
            gridColsClassName={
              leftCollapsed
                ? 'grid-cols-1 md:grid-cols-3 xl:grid-cols-4'
                : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
            }
            headerLeadingSlot={
              leftCollapsed ? (
                <RailExpandChip side="left" label="Categories" onClick={() => setLeftCollapsed(false)} />
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
            key={c.slug}
            active={activeSlug === c.slug}
            onClick={() => onChange(c.slug)}
            label={c.name}
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
          key={c.slug}
          type="button"
          onClick={() => onChange(c.slug)}
          className={`touch-hit ${chip(activeSlug === c.slug)}`}
        >
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
}: {
  active: boolean;
  onClick: () => void;
  label: string;
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
      <span className="flex-1 truncate">{label}</span>
    </button>
  );
}
