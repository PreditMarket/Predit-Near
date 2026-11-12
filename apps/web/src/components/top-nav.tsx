'use client';

/**
 * The top navigation bar: the sections on the left, the NEAR account on
 * the right. On mobile widths a hamburger opens a drawer with the same items.
 */

import { Menu } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { useNearWallet } from '@/store/near-wallet.store';
import { BrandMark } from '@/components/nav/brand-mark';
import { ScreenSwitcher } from '@/components/nav/screen-switcher';
import { MobileDrawer } from '@/components/nav/mobile-drawer';
import { RightCluster } from '@/components/nav/right-cluster';
import {
  buildNavItems,
  type NavItem,
} from '@/components/nav/nav-items';
import { getCurrentPage } from '@/components/nav/nav-helpers';

export function TopNav() {
  const pathname = usePathname();
  const accountId = useNearWallet((s) => s.accountId);
  const connect = useNearWallet((s) => s.connect);

  const isMobile = useIsMobile(1024);

  // Scroll-aware hide/show: topnav slides up when the user scrolls down past
  // a threshold; slides back when they scroll up. Filter bars underneath
  // read `--nav-y` and shift their `sticky` top in lockstep.
  // Not on the home while its side rails show: they would jump 40px with it.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.getElementById('scroll-root');
    if (!root) return;
    const railsShown = window.matchMedia('(min-width: 768px)');
    const pinned = () => pathname === '/' && railsShown.matches;
    let last = root.scrollTop;
    let ticking = false;
    const NAV_HEIGHT = 40;
    const THRESHOLD = 8;
    const set = (hidden: boolean) => {
      document.documentElement.style.setProperty(
        '--nav-y',
        hidden ? `-${NAV_HEIGHT}px` : '0px',
      );
    };
    set(false);
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = root.scrollTop;
        const dy = y - last;
        if (pinned()) {
          set(false);
          last = y;
        } else if (Math.abs(dy) > THRESHOLD) {
          if (dy > 0 && y > NAV_HEIGHT) set(true);
          else if (dy < 0) set(false);
          last = y;
        }
        ticking = false;
      });
    };
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      root.removeEventListener('scroll', onScroll);
      document.documentElement.style.removeProperty('--nav-y');
    };
  }, [pathname]);

  const [drawerOpen, setDrawerOpen] = useState(false);

  const navItems = useMemo(() => buildNavItems(), []);
  const currentPage = getCurrentPage(pathname);

  // Close mobile drawer on route change (submenu state lives inside its owners).
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  /**
   * Guard for nav clicks. Returns true if navigation should proceed.
   * Used by NavButton onClick handlers — caller does `e.preventDefault()` on false.
   */
  const canNavigate = (_id: string, requiresAuth: boolean): boolean => {
    if (requiresAuth && !accountId) {
      void connect();
      return false;
    }
    return true;
  };

  return (
    <>
      <header
        style={{
          transform: 'translate3d(0, var(--nav-y, 0px), 0)',
          transition: 'transform 220ms ease-out',
        }}
        className="sticky top-0 z-40 border-b border-white/8 bg-background/68 backdrop-blur-[24px] backdrop-saturate-[180%] [-webkit-backdrop-filter:saturate(180%)_blur(24px)] px-[14px] h-[40px] [font-family:var(--font-mono)] text-[11px]"
      >
        <div className="flex items-center gap-[3px] h-full">
          {isMobile ? (
            <>
              <button
                className="touch-hit p-1 rounded-md hover:bg-muted/50 transition-colors"
                onClick={() => setDrawerOpen(true)}
                title="Open menu"
                aria-label="Open menu"
              >
                <Menu className="w-4 h-4" />
              </button>
              <div className="flex-1 flex justify-center">
                <BrandMark />
              </div>
              <RightCluster />
            </>
          ) : (
            <>
              <BrandMark />
              <ScreenSwitcher
                navItems={navItems}
                currentPage={currentPage}
                canNavigate={canNavigate}
              />
              <RightCluster />
            </>
          )}
        </div>
      </header>

      {isMobile && (
        <MobileDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          navItems={navItems}
          currentPage={currentPage}
          canNavigate={canNavigate}
        />
      )}
    </>
  );
}

// Re-export for any external consumers that expected the previous surface.
export type { NavItem };
