'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { BrandMark } from './brand-mark';
import { NavButton } from './nav-button';
import type { NavItem } from './nav-items';

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  navItems: NavItem[];
  currentPage: string;
  canNavigate: (id: string, requiresAuth: boolean) => boolean;
}

/** Slide-in mobile nav sheet. Trigger button lives in <TopNav>. */
export function MobileDrawer({
  open,
  onClose,
  navItems,
  currentPage,
  canNavigate,
}: MobileDrawerProps) {
  const pathname = usePathname();
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
  const submenuRef = useRef<HTMLDivElement | null>(null);

  // Close submenu on route change to keep drawer state fresh.
  useEffect(() => {
    setOpenSubmenu(null);
  }, [pathname]);

  // Radix owns focus trapping, Escape and scroll locking.
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side="left"
        aria-describedby={undefined}
        className="w-72 gap-0 border-border bg-background/92 backdrop-blur-2xl pb-[env(safe-area-inset-bottom)] [&>button:last-child]:touch-hit"
      >
        <div className="flex items-center px-4 py-3.5 border-b border-border">
          <SheetTitle asChild>
            <div>
              <BrandMark />
            </div>
          </SheetTitle>
        </div>
        <nav className="flex-1 overflow-y-auto scrollbar-hide px-2 py-3 space-y-0.5">
          {navItems.map((item) => (
            <NavButton
              key={item.id}
              item={item}
              variant="drawer"
              currentPage={currentPage}
              openSubmenu={openSubmenu}
              setOpenSubmenu={setOpenSubmenu}
              submenuRef={submenuRef}
              canNavigate={canNavigate}
            />
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
