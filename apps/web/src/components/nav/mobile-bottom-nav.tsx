'use client';

import { HoverPrefetchLink } from './hover-prefetch-link';
import { usePathname } from 'next/navigation';
import { House, PieChart, TrendingUp, Wallet } from 'lucide-react';
import { useAppShellStore } from '@/store/app-shell-store';
import useAuthStore from '@/store/auth.store';
import { useV2AuthStore } from '@/store/v2-auth-store';
import { getCurrentPage, hrefFor } from './nav-helpers';

interface Tab {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  requiresAuth: boolean;
}

const TABS: Tab[] = [
  { id: 'home', label: 'Feed', icon: House, requiresAuth: false },
  { id: 'markets', label: 'Markets', icon: TrendingUp, requiresAuth: false },
  { id: 'deposit', label: 'Deposit', icon: Wallet, requiresAuth: true },
  { id: 'portfolio', label: 'Portfolio', icon: PieChart, requiresAuth: true },
];

/**
 * Below lg the top nav collapses to a hamburger, so the main destinations
 * move here, within thumb reach. Everything else stays in the drawer. Its
 * height is `--mobile-nav-h`, which bottom-fixed UI offsets itself by.
 */
export function MobileBottomNav() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const v2User = useV2AuthStore((s) => s.user);
  const setOpen = useAppShellStore((s) => s.setOpen);
  const current = getCurrentPage(pathname);
  const signedIn = !!(user || v2User);

  return (
    <nav
      aria-label="Main"
      className="shrink-0 lg:hidden border-t border-white/8 bg-background/92 backdrop-blur-[20px] pb-[env(safe-area-inset-bottom)]"
    >
      {/* 55px + the 1px top border = the 56px in `--mobile-nav-h`. */}
      <ul className="flex h-[55px]">
        {TABS.map(({ id, label, icon: Icon, requiresAuth }) => {
          const active = current === id;
          return (
            <li key={id} className="flex-1">
              <HoverPrefetchLink
                href={hrefFor(id)}
                aria-current={active ? 'page' : undefined}
                onClick={(e) => {
                  if (requiresAuth && !signedIn) {
                    e.preventDefault();
                    setOpen('walletConnectOpen', true);
                  }
                }}
                className={`flex h-full flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors ${
                  active ? 'text-primary' : 'text-white/55 active:text-white'
                }`}
              >
                <Icon className="h-5 w-5" />
                {label}
              </HoverPrefetchLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
