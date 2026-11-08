'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import { LeftRailMarket } from './left-rail-market';
import { CenterFeed } from './center-feed';
import { RightRailPreditAi } from './right-rail-predit-ai';
import { HomeColumn } from './home-column';
import { PumpColumn } from './pump/pump-column';
import type { QuickSpotAsset } from './quick-spot-asset-panel';

// The feed is what the center shows on load. Every other mode opens on a
// click and pulls in a heavy stack (Anchor + the PAMM IDL, react-markdown +
// syntax highlighting, lightweight-charts), so each is its own chunk,
// fetched the first time it opens.
function CenterLoading() {
  return <div className="h-full min-h-[50vh] animate-pulse bg-background" />;
}
const TradingPanel = dynamic(
  () => import('./trading-panel').then((m) => m.TradingPanel),
  { ssr: false, loading: CenterLoading },
);
const HomeChatView = dynamic(
  () => import('./home-chat-view').then((m) => m.HomeChatView),
  { ssr: false, loading: CenterLoading },
);
const ThreadView = dynamic(
  () => import('./thread-view').then((m) => m.ThreadView),
  { ssr: false, loading: CenterLoading },
);
const QuickPerpsTradePanel = dynamic(
  () => import('./quick-perps-trade-panel').then((m) => m.QuickPerpsTradePanel),
  { ssr: false, loading: CenterLoading },
);
const QuickSpotAssetPanel = dynamic(
  () => import('./quick-spot-asset-panel').then((m) => m.QuickSpotAssetPanel),
  { ssr: false, loading: CenterLoading },
);
import {
  getPammMarketById,
  type PammMarket,
} from '@/services/pamm-market.service';
import type { ChatMarket } from '@/components/v2/chat/predit-chat';
import type { FeedItem } from '@/types/feed';
import { useAppShellStore } from '@/store/app-shell-store';
import {
  PerpsPlatformProvider,
  usePerpsPlatformStore,
  type PerpsPlatform,
} from '@/store/perps-platform.store';
import type { QuickPerpsTradeMarket } from '@/components/perps/quick-perps-trade-dialog';
import type { PhoenixMarket } from '@/lib/phoenix-perps/types';
import type { SpotMarketToken } from '@/services/v2-spot.service';
import { pumpAssetOf, type PumpToken } from '@/lib/v2/pump';
import { usePumpEnabled, useRetainPumpFeed } from '@/hooks/v2/use-pump-feed';
import {
  HOME_FOLDED_WIDTH,
  useHomeLayoutStore,
  type HomeColumnId,
} from '@/store/home-layout-store';

/** Which "primary content" fills the center slot. */
type CenterMode =
  | { kind: 'feed' }
  | { kind: 'market'; market: PammMarket }
  // chatId null = new chat. `opened` remounts the chat per open, so "New
  // chat" from a new chat starts clean; `market` / `prompt` come from "Ask
  // Predit AI" on a market or perps panel (plan 05 F5).
  | {
      kind: 'chat';
      chatId: string | null;
      opened: number;
      market?: ChatMarket | null;
      prompt?: string | null;
    }
  | { kind: 'thread'; post: Extract<FeedItem, { kind: 'post' }> }
  // `opened` remounts a trade panel per click, so a click always lands on
  // that market even after the panel's own picker moved elsewhere.
  | { kind: 'spot'; asset: QuickSpotAsset; opened: number }
  // `platform`: the venue the market trades on (the rail lists both).
  | {
      kind: 'perps';
      market: QuickPerpsTradeMarket;
      platform: PerpsPlatform;
      opened: number;
    };

/**
 * Client shell, four columns: Market | New tokens | Social | Predit AI.
 * Each side column is sized by dragging its edge and folds to a strip; the
 * center takes what's left (home-layout-store remembers the arrangement).
 * Narrower screens drop columns: Predit AI below xl (lg while the New
 * tokens feed is off), New tokens below lg, Market below md.
 *
 * Owns:
 * - the primary center mode (feed / a trade / Predit AI chat / a thread)
 * - the currently-selected market (row click swaps center to trading panel)
 * - the currently-open chat (right rail row click swaps center to chat view)
 *
 * Opening a trade leaves both rails as they are: only the user folds them.
 */
export function HomeShell() {
  const widths = useHomeLayoutStore((s) => s.widths);
  const folded = useHomeLayoutStore((s) => s.folded);
  const setFolded = useHomeLayoutStore((s) => s.setFolded);
  // The arrangement is read after mount: the server rendered the defaults.
  useEffect(() => {
    void useHomeLayoutStore.persist.rehydrate();
  }, []);
  // The New tokens column, while an admin has the feed on (off by default).
  const pumpOn = usePumpEnabled() === true;
  const [center, setCenter] = useState<CenterMode>({ kind: 'feed' });
  // The wallet picked on the perps page: where bottom-bar perps opens.
  const platform = usePerpsPlatformStore((s) => s.platform);

  // The bottom bar publishes intents only while this shell can take them.
  const setHomeShellActive = useAppShellStore((s) => s.setHomeShellActive);
  useEffect(() => {
    setHomeShellActive(true);
    return () => setHomeShellActive(false);
  }, [setHomeShellActive]);

  // BottomBar ticker/perps clicks can't reach this component via props (it's
  // mounted globally, outside HomeShell's tree), so they publish an intent
  // to the shared store instead. Consume it once, then clear it so it
  // doesn't re-fire on remounts.
  const homeQuickTradeIntent = useAppShellStore((s) => s.homeQuickTradeIntent);
  const setHomeQuickTradeIntent = useAppShellStore(
    (s) => s.setHomeQuickTradeIntent,
  );
  useEffect(() => {
    if (!homeQuickTradeIntent) return;
    // A PAMM market by id ("Trade on Predit" in a Predit AI answer).
    if (homeQuickTradeIntent.kind === 'market') {
      const { marketId } = homeQuickTradeIntent;
      setHomeQuickTradeIntent(null);
      getPammMarketById(marketId)
        .then((market) => setCenter({ kind: 'market', market }))
        .catch(() => toast.error('This market is not available'));
      return;
    }
    setCenter(
      homeQuickTradeIntent.kind === 'spot'
        ? {
            kind: 'spot',
            asset: homeQuickTradeIntent.asset,
            opened: Date.now(),
          }
        : {
            kind: 'perps',
            market: homeQuickTradeIntent.market,
            platform,
            opened: Date.now(),
          },
    );
    setHomeQuickTradeIntent(null);
  }, [homeQuickTradeIntent, setHomeQuickTradeIntent, platform]);

  // "Ask Predit AI" on a market / perps panel: a new chat in the center
  // about that market, or with its question ready.
  const homeChatIntent = useAppShellStore((s) => s.homeChatIntent);
  const setHomeChatIntent = useAppShellStore((s) => s.setHomeChatIntent);
  useEffect(() => {
    if (!homeChatIntent) return;
    setCenter({
      kind: 'chat',
      chatId: null,
      opened: Date.now(),
      market: homeChatIntent.market ?? null,
      prompt: homeChatIntent.prompt ?? null,
    });
    setHomeChatIntent(null);
  }, [homeChatIntent, setHomeChatIntent]);
  const openChat = useCallback(
    (chatId: string | null) =>
      setCenter({ kind: 'chat', chatId, opened: Date.now() }),
    [],
  );

  const expandRight = useCallback(() => setFolded('ai', false), [setFolded]);
  const collapseRight = useCallback(() => setFolded('ai', true), [setFolded]);

  const selectedMarketId =
    center.kind === 'market' ? center.market.id : undefined;
  const activeChatId = center.kind === 'chat' ? center.chatId : undefined;
  const closeTrade = () => setCenter({ kind: 'feed' });

  // Market rail rows trade here, in the center, rather than leaving home.
  const openSpotAsset = useCallback(
    (asset: QuickSpotAsset) =>
      setCenter({ kind: 'spot', asset, opened: Date.now() }),
    [],
  );
  const openSpot = useCallback(
    (t: SpotMarketToken) =>
      openSpotAsset({
        id: t.id,
        symbol: t.symbol,
        name: t.name,
        decimals: t.decimals,
        logoURI: t.logoURI,
      }),
    [openSpotAsset],
  );
  const openPump = useCallback(
    (t: PumpToken) =>
      openSpotAsset({
        ...pumpAssetOf(t),
        pump: { mint: t.mint, bondingPct: t.bondingPct, graduated: t.graduated },
      }),
    [openSpotAsset],
  );
  // The new-token stream opens with home, so both its lists start full.
  useRetainPumpFeed();
  const openPerps = useCallback(
    (m: PhoenixMarket) =>
      setCenter({
        kind: 'perps',
        market: { symbol: `${m.symbol}-PERP`, baseSymbol: m.symbol },
        platform: m.venue === 'lighter' ? 'lighter' : 'phoenix',
        opened: Date.now(),
      }),
    [],
  );
  const expandRightIfFolded = folded.ai ? expandRight : undefined;

  // The page (#scroll-root) scrolls, not the center column, so a thread
  // opened from far down the feed kept that offset and began under its
  // sticky header. Open threads at the top; going back puts the feed where
  // it was.
  const feedScrollRef = useRef<number | null>(null);
  const openThread = useCallback((post: Extract<typeof center, { kind: 'thread' }>['post']) => {
    feedScrollRef.current = document.getElementById('scroll-root')?.scrollTop ?? null;
    setCenter({ kind: 'thread', post });
  }, []);
  useLayoutEffect(() => {
    const root = document.getElementById('scroll-root');
    if (!root) return;
    if (center.kind === 'thread') {
      root.scrollTo({ top: 0 });
    } else if (center.kind === 'feed' && feedScrollRef.current !== null) {
      const top = feedScrollRef.current;
      feedScrollRef.current = null;
      // The feed lays its cached pages out again over a few frames; scrolling
      // before it is tall enough would stop short. Wait (≤ ~1 s) until the
      // offset fits, then go there.
      const restore = (framesLeft: number) => {
        if (root.scrollHeight - root.clientHeight >= top || framesLeft === 0) {
          root.scrollTo({ top });
        } else {
          requestAnimationFrame(() => restore(framesLeft - 1));
        }
      };
      requestAnimationFrame(() => restore(60));
    }
  }, [center.kind]);

  // One track per column on screen, so each breakpoint's template lists
  // exactly the columns showing there; the widths come in as variables.
  const track = (id: HomeColumnId) => `${folded[id] ? HOME_FOLDED_WIDTH : widths[id]}px`;
  const tracks = {
    '--hc-market': track('market'),
    '--hc-pump': track('pump'),
    '--hc-ai': track('ai'),
  } as React.CSSProperties;
  const cols = pumpOn
    ? 'grid-cols-1 md:grid-cols-[var(--hc-market)_minmax(0,1fr)] lg:grid-cols-[var(--hc-market)_var(--hc-pump)_minmax(0,1fr)] xl:grid-cols-[var(--hc-market)_var(--hc-pump)_minmax(0,1fr)_var(--hc-ai)]'
    : 'grid-cols-1 md:grid-cols-[var(--hc-market)_minmax(0,1fr)] lg:grid-cols-[var(--hc-market)_minmax(0,1fr)_var(--hc-ai)]';

  // Exactly what the top nav (40px), the bottom bar (30px) and, below lg, the
  // mobile nav leave: a fixed-height center (chat, trade) never scrolls the page.
  return (
    <div
      className="flex flex-col min-h-[calc(var(--app-h)-70px-var(--mobile-nav-h)-var(--banner-h,0px))] bg-background"
      aria-label="Home v2 preview"
    >
      <div className={`grid flex-1 items-start ${cols}`} style={tracks}>
        <HomeColumn id="market" title="Market" edge="right" className="hidden md:block">
          <LeftRailMarket
            onCollapse={() => setFolded('market', true)}
            onSelectMarket={(m) => setCenter({ kind: 'market', market: m })}
            selectedMarketId={selectedMarketId}
            onOpenSpot={openSpot}
            onOpenPerps={openPerps}
            selectedSpotId={center.kind === 'spot' ? center.asset.id : null}
            selectedPerpsKey={
              center.kind === 'perps'
                ? `${center.platform}:${center.market.baseSymbol}`
                : null
            }
          />
        </HomeColumn>

        {pumpOn && (
          <HomeColumn id="pump" title="New tokens" edge="right" className="hidden lg:block">
            <PumpColumn
              onOpen={openPump}
              selectedId={center.kind === 'spot' ? center.asset.id : null}
              onCollapse={() => setFolded('pump', true)}
            />
          </HomeColumn>
        )}

        {center.kind === 'market' ? (
          <TradingPanel
            market={center.market}
            onClose={closeTrade}
            onExpandRight={expandRightIfFolded}
          />
        ) : center.kind === 'chat' ? (
          <HomeChatView
            key={center.opened}
            chatId={center.chatId}
            market={center.market}
            draft={center.prompt}
            onChatCreated={(chatId) =>
              setCenter((c) => (c.kind === 'chat' ? { ...c, chatId } : c))
            }
            onClose={() => setCenter({ kind: 'feed' })}
          />
        ) : center.kind === 'thread' ? (
          <ThreadView
            post={center.post}
            onClose={() => setCenter({ kind: 'feed' })}
          />
        ) : center.kind === 'spot' ? (
          <QuickSpotAssetPanel
            key={`${center.asset.id}:${center.opened}`}
            asset={center.asset}
            onClose={closeTrade}
            onExpandRight={expandRightIfFolded}
            onOpenAsset={openSpotAsset}
          />
        ) : center.kind === 'perps' ? (
          <PerpsPlatformProvider value={center.platform} routeFeeds={false}>
            <QuickPerpsTradePanel
              key={`${center.platform}:${center.market.baseSymbol}:${center.opened}`}
              market={center.market}
              onClose={closeTrade}
              onExpandRight={expandRightIfFolded}
            />
          </PerpsPlatformProvider>
        ) : (
          <CenterFeed
            onOpenThread={openThread}
            onOpenAi={() => openChat(null)}
            onOpenPump={openPump}
            aiColumnFrom={pumpOn ? 'xl' : 'lg'}
          />
        )}

        <HomeColumn
          id="ai"
          title="Predit AI"
          edge="left"
          className={pumpOn ? 'hidden xl:block' : 'hidden lg:block'}
        >
          <RightRailPreditAi
            activeChatId={activeChatId ?? null}
            onOpenChat={openChat}
            onCollapse={collapseRight}
          />
        </HomeColumn>
      </div>
    </div>
  );
}
