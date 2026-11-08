'use client';

import { ChevronDown } from 'lucide-react';
import { HoverPrefetchLink } from './hover-prefetch-link';
import type { NavItem } from './nav-items';
import { hrefFor } from './nav-helpers';

type NavButtonVariant = 'topnav' | 'drawer';

interface NavButtonProps {
  item: NavItem;
  variant?: NavButtonVariant;
  currentPage: string;
  openSubmenu: string | null;
  setOpenSubmenu: (id: string | null) => void;
  submenuRef?: React.MutableRefObject<HTMLDivElement | null>;
  canNavigate: (id: string, requiresAuth: boolean) => boolean;
}

function renderIcon(item: NavItem, hidden: boolean) {
  if (hidden || item.hideIcon) return null;
  if (item.iconUrl) {
    return (
      <img
        src={item.iconUrl}
        alt=""
        className="w-3 h-3 shrink-0 rounded-sm object-contain"
      />
    );
  }
  const Icon = item.icon;
  return <Icon className="w-3.5 h-3.5 shrink-0" />;
}

// v2-launch topnav pill: uppercase 10px mono, 5px radius, 26px height, subtle turq active
const TOPNAV_BASE =
  'inline-flex items-center gap-1 rounded-[5px] h-[26px] px-[10px] uppercase transition-colors whitespace-nowrap leading-none';
const TOPNAV_TEXT =
  'font-semibold text-[10px] tracking-[0.06em] [font-family:var(--font-mono)]';
const TOPNAV_INACTIVE = 'text-white/65 hover:text-white hover:bg-white/4';
const TOPNAV_ACTIVE = 'text-primary bg-primary/8';

// Drawer (mobile) keeps the richer look: icons + label rows
const DRAWER_BASE =
  'flex items-center gap-2 rounded-[10px] text-sm font-medium transition-colors';
const DRAWER_INACTIVE =
  'text-muted-foreground hover:text-foreground hover:bg-muted/50';
const DRAWER_ACTIVE =
  'bg-elevated text-foreground [&_svg]:text-primary';

/** Nav item renderer used by both the desktop <ScreenSwitcher> and mobile <MobileDrawer>. */
export function NavButton({
  item,
  variant = 'topnav',
  currentPage,
  openSubmenu,
  setOpenSubmenu,
  submenuRef,
  canNavigate,
}: NavButtonProps) {
  const isTop = variant === 'topnav';
  const hasChildren = !!item.children?.length;
  const childActive = item.children?.some((c) => c.id === currentPage);
  const isActive = currentPage === item.id || childActive;

  const base = isTop ? `${TOPNAV_BASE} ${TOPNAV_TEXT}` : DRAWER_BASE;
  const sizing = isTop ? '' : 'w-full px-3 min-h-11';
  const active = isActive
    ? isTop
      ? TOPNAV_ACTIVE
      : DRAWER_ACTIVE
    : isTop
      ? TOPNAV_INACTIVE
      : DRAWER_INACTIVE;
  const hideItemIcon = isTop; // topnav is text-only per v2-launch mockup

  if (hasChildren) {
    const isOpen = openSubmenu === item.id;
    const hoverHandlers = !isTop
      ? {}
      : {
          onMouseEnter: () => setOpenSubmenu(item.id),
          onMouseLeave: () =>
            setOpenSubmenu(openSubmenu === item.id ? null : openSubmenu),
        };
    return (
      <div
        key={item.id}
        ref={isOpen ? submenuRef : null}
        className={isTop ? 'relative' : 'w-full'}
        {...hoverHandlers}
      >
        <button
          className={`${base} ${sizing} ${active}`}
          onClick={() => setOpenSubmenu(isOpen ? null : item.id)}
        >
          {renderIcon(item, hideItemIcon)}
          <span>{item.label}</span>
          <ChevronDown
            className={`w-3 h-3 shrink-0 transition-transform ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </button>
        {isOpen &&
          (isTop ? (
            <div className="absolute left-0 top-full pt-1 z-50">
              <div className="min-w-44 rounded-md border border-border bg-popover shadow-lg p-1">
                {item.children!.map((c) => (
                  <HoverPrefetchLink
                    key={c.id}
                    href={hrefFor(c.id)}
                    className={`${DRAWER_BASE} w-full px-2.5 py-1.5 ${
                      currentPage === c.id ? DRAWER_ACTIVE : DRAWER_INACTIVE
                    }`}
                    onClick={(e) => {
                      setOpenSubmenu(null);
                      if (!canNavigate(c.id, c.requiresAuth)) {
                        e.preventDefault();
                      }
                    }}
                  >
                    {renderIcon(c, false)}
                    <span>{c.label}</span>
                  </HoverPrefetchLink>
                ))}
              </div>
            </div>
          ) : (
            <div className="ml-4 mt-1 space-y-0.5">
              {item.children!.map((c) => (
                <HoverPrefetchLink
                  key={c.id}
                  href={hrefFor(c.id)}
                  className={`${DRAWER_BASE} w-full px-3 min-h-11 ${
                    currentPage === c.id ? DRAWER_ACTIVE : DRAWER_INACTIVE
                  }`}
                  onClick={(e) => {
                    setOpenSubmenu(null);
                    if (!canNavigate(c.id, c.requiresAuth)) {
                      e.preventDefault();
                    }
                  }}
                >
                  {renderIcon(c, false)}
                  <span>{c.label}</span>
                </HoverPrefetchLink>
              ))}
            </div>
          ))}
      </div>
    );
  }

  return (
    <HoverPrefetchLink
      key={item.id}
      href={hrefFor(item.id)}
      className={`${base} ${sizing} ${active}`}
      onClick={(e) => {
        if (!canNavigate(item.id, item.requiresAuth)) {
          e.preventDefault();
        }
      }}
    >
      {renderIcon(item, hideItemIcon)}
      <span>{item.label}</span>
    </HoverPrefetchLink>
  );
}
