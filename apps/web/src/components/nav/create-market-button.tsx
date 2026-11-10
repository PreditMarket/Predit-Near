'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { useNearWallet } from '@/store/near-wallet.store';
import { getCurrentPage } from './nav-helpers';

/** Nav pages that show prediction markets: `/markets`, `/market/*` and home. */
const PREDICTION_PAGES = new Set(['home', 'markets', 'pamm']);
const CREATE_PATH = '/market/create';

/**
 * "Create market", in the nav while prediction markets are on screen, so it
 * stays put however far the list scrolls. Shown once a wallet is connected. "+ Market" alone below xl, where the nav items already
 * fill most of the bar; a square "+" below lg, where the bar has room for
 * little more than the logo and the balance.
 */
export function CreateMarketButton() {
  const pathname = usePathname();
  const router = useRouter();
  const accountId = useNearWallet((s) => s.accountId);
  const compact = useIsMobile(1024);

  if (!accountId || !PREDICTION_PAGES.has(getCurrentPage(pathname))) return null;
  // Already on the creator: the CTA would only reload it.
  if (pathname?.startsWith(CREATE_PATH)) return null;

  return (
    <div className="flex items-center gap-2">
      {/* The glow lives on an inner span: `create-cta` takes `::after` (its
          shine) and clips overflow, which would eat `touch-hit`'s 44px
          target if both sat on one element. */}
      <button
        type="button"
        onClick={() => router.push(CREATE_PATH)}
        title="Create market"
        aria-label="Create market"
        className="group touch-hit inline-flex"
      >
        {/* The glow sits behind the button on its own element: opacity
            only, so its pulse never repaints the button (plan 21). */}
        <span className="relative inline-flex rounded-md">
          <span aria-hidden className="cta-glow cta-glow-turq" />
          <span
            className={`create-cta inline-flex h-6.5 items-center justify-center gap-1 whitespace-nowrap rounded-md bg-primary font-mono text-[10.5px] font-bold uppercase leading-none tracking-[0.06em] text-primary-foreground transition-[filter] group-hover:brightness-110 ${compact ? 'w-6.5' : 'px-2'}`}
          >
            <Plus className="size-3.5" />
            {!compact && (
              <>
                <span className="hidden xl:inline">Create </span>market
              </>
            )}
          </span>
        </span>
      </button>
      {/* The section's action | money + account. */}
      {!compact && <span aria-hidden className="h-4 w-px bg-white/10" />}
    </div>
  );
}
