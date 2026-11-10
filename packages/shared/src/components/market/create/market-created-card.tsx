'use client';

import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';

import { useShareUrl } from '@/utils/referral-link';

/** Predit's mark as an inline path (not an <img src="/logo-*.svg">) so this
 * renders correctly from any app without depending on that app's public/
 * folder having the asset — packages/shared components run in both web and
 * admin. */
function PreditMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 155.7" className={className} fill="currentColor">
      <path d="M72.6,0.6H12.7l18.7,18.7L57,44.9c1.1,1.1,0.4,3.1-1.3,3.1H0.2v59.9l0,0L30,137.7l18.2,18.2h59.9l-19.4-19.4 l-25.6-25.8c-1.1-1.1-0.4-3.1,1.3-3.1H120V47.8L72.6,0.6z M63,104.5c-1.8,1.8-4.4,1.8-6,0L30.1,77.6L57,50.7l0,0 c1.8-1.6,4.2-1.6,6,0l26.9,26.9L63,104.5z" />
    </svg>
  );
}

interface MarketCreatedCardProps {
  /** "Your Market" / "Your Group". */
  itemLabel: string;
  /** The question / group title. */
  itemTitle: string;
  thumbnailUrl?: string;
  /** Relative or absolute URL to the created market/group — used for the share link only ("My markets →" always goes to /market?tab=my-markets, not this URL). */
  url: string;
  needsApproval?: boolean;
  /** Closes the modal. No standalone close (X) button — "Skip for now" and
   * "My markets" are the only two ways out, and both call this before navigating. */
  onDismiss: () => void;
  /** Replaces "My markets →", e.g. to bet on the new market without leaving the page. */
  primaryAction?: { label: string; onClick: () => void };
  /** Replaces "Skip for now", which otherwise opens the market's page. */
  skipAction?: { label: string; onClick: () => void };
}

/**
 * The create-market/create-group success state — styled as a shareable
 * "launch" moment (dark card, primary-color glow, Predit mark watermark)
 * instead of a plain checklist-done dialog. Shared by both progress modals
 * (single-market and group) so the moment looks identical either way.
 */
export function MarketCreatedCard({
  itemLabel,
  itemTitle,
  thumbnailUrl,
  url,
  needsApproval,
  onDismiss,
  primaryAction,
  skipAction,
}: MarketCreatedCardProps) {
  const router = useRouter();

  const handleSkip = () => {
    onDismiss();
    router.push(url);
  };

  const handleViewMyMarkets = () => {
    onDismiss();
    router.push('/portfolio?tab=my-markets');
  };

  const absUrl = useShareUrl(url);

  const handleShareX = () => {
    // Blank line between the headline and the call to action: X renders the
    // break, so the tweet reads as two beats instead of one long dash-joined
    // sentence.
    //
    // `@preditmarket` is the real X handle — the one `quest-page` links to.
    // Writing the domain as `@predit.market` would NOT mention the brand: X
    // stops a handle at the dot, so it would tag someone else's `@predit` and
    // leave `.market` as plain text.
    const text = encodeURIComponent(
      needsApproval
        ? `Just submitted "${itemTitle}" on @preditmarket !\n\nlive once approved 👀`
        : `Just launched "${itemTitle}" on @preditmarket !\n\ngo stake your take 👇`,
    );
    window.open(
      `https://x.com/intent/tweet?text=${text}&url=${encodeURIComponent(absUrl)}`,
      '_blank',
    );
  };

  return (
    <div className="relative overflow-hidden rounded-3xl border border-primary/25 bg-linear-to-br from-background via-card to-background shadow-[0_0_60px_rgba(0,0,0,0.5)]">
      {/* Decorative glow blobs — primary-colored, matching the app theme
          instead of the yellow/black reference design. */}
      <div className="pointer-events-none absolute -left-16 -top-20 h-64 w-64 rounded-full bg-primary/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -right-16 h-64 w-64 rounded-full bg-primary/15 blur-3xl" />

      {/* Subtle grid pattern, matching the app's other "shareable card" style. */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />

      {/* Watermark */}
      <PreditMark className="pointer-events-none absolute -bottom-14 -right-10 h-56 w-56 rotate-12 text-primary opacity-[0.07]" />

      <div className="relative z-10 space-y-5 p-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <PreditMark className="h-5 w-auto text-white" />
            <span className="text-sm font-bold tracking-tight text-white">
              Predit
            </span>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-success/40 bg-success/10 px-2.5 py-1 backdrop-blur-sm">
            <Check className="h-3 w-3 text-success" />
            <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-success">
              {needsApproval ? 'Submitted' : 'Confirmed'}
            </span>
          </span>
        </div>

        {/* Headline */}
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-primary">
            New {itemLabel === 'Your Group' ? 'Group' : 'Market'}
          </p>
          <h2 className="mt-1 text-3xl font-black uppercase leading-[1.05] tracking-tight text-white">
            {needsApproval ? 'Submitted' : 'Live Now'}
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-white/60">
            {needsApproval
              ? "It's in review — you'll be notified once an admin approves it."
              : "It's live. Give your first traders something to discover."}
          </p>
        </div>

        {/* Item card */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            {thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumbnailUrl}
                alt={itemTitle}
                className="h-12 w-12 shrink-0 rounded-xl object-cover"
              />
            ) : (
              <div className="h-12 w-12 shrink-0 rounded-xl bg-white/10" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/40">
                {itemLabel}
              </p>
              <p className="truncate text-sm font-bold text-white">
                {itemTitle}
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 text-[9px] font-bold uppercase tracking-[0.15em] text-success">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
              {needsApproval ? 'Pending' : 'Live'}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleShareX}
            className="rounded-xl border border-white/15 bg-white/5 py-2.5 text-[11px] font-bold uppercase tracking-widest text-white transition-colors hover:bg-white/10"
          >
            Share on X
          </button>
          <button
            type="button"
            data-testid="created-primary"
            onClick={primaryAction?.onClick ?? handleViewMyMarkets}
            className="rounded-xl bg-primary py-2.5 text-[11px] font-bold uppercase tracking-widest text-primary-foreground transition-all hover:brightness-110"
          >
            {primaryAction?.label ?? 'My markets →'}
          </button>
        </div>
        <button
          type="button"
          data-testid="created-skip"
          onClick={skipAction?.onClick ?? handleSkip}
          className="w-full text-center text-[11px] text-white/40 transition-colors hover:text-white/60"
        >
          {skipAction?.label ?? 'Skip for now'}
        </button>
      </div>
    </div>
  );
}
