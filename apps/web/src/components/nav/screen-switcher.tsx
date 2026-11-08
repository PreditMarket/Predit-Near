'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { NavItem } from './nav-items';
import { NavButton } from './nav-button';

interface ScreenSwitcherProps {
  navItems: NavItem[];
  currentPage: string;
  canNavigate: (id: string, requiresAuth: boolean) => boolean;
}

/** Desktop horizontal nav (Predictions / Trading / Earn / …). */
export function ScreenSwitcher({
  navItems,
  currentPage,
  canNavigate,
}: ScreenSwitcherProps) {
  const pathname = usePathname();
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
  const submenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setOpenSubmenu(null);
  }, [pathname]);

  useEffect(() => {
    if (!openSubmenu) return;
    const onClick = (e: MouseEvent) => {
      if (
        submenuRef.current &&
        !submenuRef.current.contains(e.target as Node)
      ) {
        setOpenSubmenu(null);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [openSubmenu]);

  return (
    <nav className="flex items-center gap-[3px] flex-1">
      {navItems.map((item) => (
        <NavButton
          key={item.id}
          item={item}
          variant="topnav"
          currentPage={currentPage}
          openSubmenu={openSubmenu}
          setOpenSubmenu={setOpenSubmenu}
          submenuRef={submenuRef}
          canNavigate={canNavigate}
        />
      ))}
    </nav>
  );
}
