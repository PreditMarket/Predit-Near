'use client';

import { useEffect, type CSSProperties } from 'react';
import { HOME_FOLDED_WIDTH, useHomeLayoutStore, type HomeColumnId } from '@/store/home-layout-store';
import { CenterFeed } from './center-feed';
import { HomeColumn } from './home-column';
import { LeftRailMarkets } from './left-rail-markets';
import { RightRailNearAi } from './right-rail-near-ai';

/**
 * Three columns, as in Predit: Markets | the feed | Predit AI. Each side column
 * is sized by dragging its edge and folds to a strip, remembered in this
 * browser. Narrower screens drop Predit AI below lg and Markets below md.
 */
export function HomeShell() {
  const widths = useHomeLayoutStore((s) => s.widths);
  const folded = useHomeLayoutStore((s) => s.folded);
  const setFolded = useHomeLayoutStore((s) => s.setFolded);
  // The arrangement is read after mount: the server rendered the defaults.
  useEffect(() => {
    void useHomeLayoutStore.persist.rehydrate();
  }, []);

  const track = (id: HomeColumnId) => `${folded[id] ? HOME_FOLDED_WIDTH : widths[id]}px`;
  const tracks = { '--hc-market': track('market'), '--hc-ai': track('ai') } as CSSProperties;

  return (
    <div className="min-h-[calc(var(--app-h)-40px-var(--mobile-nav-h)-var(--banner-h,0px))] bg-background">
      <div
        className="grid items-start grid-cols-1 md:grid-cols-[var(--hc-market)_minmax(0,1fr)] lg:grid-cols-[var(--hc-market)_minmax(0,1fr)_var(--hc-ai)]"
        style={tracks}
      >
        <HomeColumn id="market" title="Markets" edge="right" className="hidden md:block">
          <LeftRailMarkets onCollapse={() => setFolded('market', true)} />
        </HomeColumn>
        <div className="min-w-0">
          <CenterFeed />
        </div>
        <HomeColumn id="ai" title="Predit AI" edge="left" className="hidden lg:block">
          <RightRailNearAi onCollapse={() => setFolded('ai', true)} />
        </HomeColumn>
      </div>
    </div>
  );
}
