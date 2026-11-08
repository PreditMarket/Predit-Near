'use client';

import {
  BarChart3,
  Clock,
  MessageCircle,
  MessageSquare,
  Users,
} from 'lucide-react';
import { ImageWithFallback } from '@/components/figma/image-with-fallback';
import { Badge } from '@/components/ui/badge';
import { getStatusBadgeProps } from '@/utils/market-utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useMarketCardImpression } from '@/hooks/use-market-card-impression';
import type { MarketType } from '@/lib/analytics';
import { PammShareButton } from '@/components/pamm/share-button';
import { useCountdown } from '@/hooks/use-countdown';

export type MarketCardSource =
  | 'predit'
  | 'polymarket'
  | 'kalshi'
  | 'pamm'
  | 'quick';
export type MarketTypeTag = 'standard' | 'social_x' | 'pamm_onchain';

function sourceToMarketType(s: MarketCardSource): MarketType {
  if (s === 'predit') return 'native';
  // Quick markets are PAMM pools under the hood; group them with 'pamm' for
  // analytics since MarketType has no dedicated 'quick' entry.
  if (s === 'quick') return 'pamm';
  return s;
}

export interface MarketCardProps {
  id: string;
  source: MarketCardSource;
  marketTypeTag?: MarketTypeTag;
  /**
   * Keep `marketTypeTag` (for onchain analytics/impression tracking) but skip
   * rendering its visual pill — e.g. when a collateral badge replaces the
   * "Onchain" tag on PAMM cards.
   */
  hideTypeTag?: boolean;
  question: string;
  subtitle?: string;
  imageUrl?: string;
  /**
   * Yes probability, 0..100. Omit / pass `undefined` when the price isn't known
   * yet (e.g. the batched on-chain read is still in flight) — the card then
   * shows a neutral loading dash instead of a misleading hard 50%.
   */
  yesPct?: number;
  volume?: string;
  endDate?: string;
  status?: string;
  outcome?: string;
  participants?: number;
  yesBid?: number;
  yesAsk?: number;
  noBid?: number;
  noAsk?: number;
  isOrdered?: boolean;
  isUserLoggedIn?: boolean;
  onCardClick?: () => void;
  onYesClick?: (e: React.MouseEvent) => void;
  onNoClick?: (e: React.MouseEvent) => void;
  onChatClick?: (e: React.MouseEvent) => void;
  onShareClick?: (e: React.MouseEvent) => void;
  isTrading?: boolean;
  timeRemaining?: string;
  /**
   * A live countdown to `targetMs`, in place of `timeRemaining`. Ticks
   * inside the card's deadline text only, so a list of cards doesn't
   * re-render every card every second.
   */
  countdownTo?: { targetMs: number | null | undefined; active: boolean };
  onDelete?: (e: React.MouseEvent) => void;
  customBadge?: React.ReactNode;
  footerAction?: React.ReactNode;
  /** Injected before the Discuss button in the card's icon rail (both compact + expanded footer variants). Optional. */
  iconRailStart?: React.ReactNode;
  className?: string;
  collateralSymbol?: string;
  hideTradeActions?: boolean;
  /** Custom text label for the YES trade button (e.g. "Trump", "Over"); falls back to "Yes". */
  optionYesLabel?: string;
  /** Custom text label for the NO trade button; falls back to "No". */
  optionNoLabel?: string;
  /**
   * Opt-in `market_card_impression` tracking. Set to the surface this
   * card renders on (e.g. 'markets', 'market-list', 'kol'); leave
   * undefined to skip impression tracking. Only onchain markets fire.
   */
  impressionSurface?: string;
  /** 0-based index in the visible list. */
  impressionPosition?: number;
  /**
   * When true, the stats footer is redesigned to match the /market page
   * mockup: pinned to the bottom of the card body (`margin-top: auto`),
   * with a divider above, an emphasised Volume stat, and 24×24 action
   * buttons (Chat / Share) that fade in on card hover. Other pages keep
   * the compact original footer.
   */
  expandedFooter?: boolean;
}

export function fmtVol(vol?: string, symbol?: string) {
  if (!vol) return null;
  const n = Number(vol);
  if (!n) return null;
  const isPxp = symbol === 'PXP';
  if (n >= 1_000_000)
    return isPxp
      ? `${(n / 1_000_000).toFixed(2)}M XP`
      : `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)
    return isPxp
      ? `${(n / 1_000).toFixed(2)}K XP`
      : `$${(n / 1_000).toFixed(2)}K`;
  return isPxp ? `${n.toFixed(2)} XP` : `$${n.toFixed(2)}`;
}

export function fmtDate(dateStr?: string) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  if (diff <= 0) return 'Ended';
  const days = Math.floor(diff / 86400000);
  if (days > 30)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (days > 0) return `${days}d`;
  const hrs = Math.floor(diff / 3600000);
  if (hrs > 0) return `${hrs}h`;
  return `${Math.floor(diff / 60000)}m`;
}

// Probability as a 2-decimal percent (`50.12%`) — whole cents hid every
// small move, so a pool hovering near 50/50 always read "50¢". Snap NO to
// `100 - YES` on the rounded value so the two sides always sum to 100.
function pct(n: number) {
  return Math.round(n * 100) / 100;
}
export function fmtPct(n: number) {
  return `${n.toFixed(2)}%`;
}
function cents(price: number) {
  return `${Math.round(price * 100)}¢`;
}

const TYPE_TAG_LABEL: Record<MarketTypeTag, string> = {
  standard: 'Standard',
  social_x: '𝕏 Social',
  pamm_onchain: 'Onchain',
};

const TYPE_TAG_STYLES: Record<MarketTypeTag, string> = {
  standard: 'bg-muted text-muted-foreground',
  social_x: 'bg-primary/15 text-primary',
  pamm_onchain: 'bg-warning/15 text-warning',
};

export function MarketCard({
  id,
  source,
  marketTypeTag,
  hideTypeTag,
  question,
  subtitle,
  imageUrl,
  yesPct,
  volume,
  endDate,
  status,
  outcome,
  participants,
  yesBid,
  yesAsk,
  noBid,
  noAsk,
  isOrdered,
  isUserLoggedIn = true,
  onCardClick,
  onYesClick,
  onNoClick,
  onChatClick,
  onShareClick,
  isTrading,
  timeRemaining,
  countdownTo,
  customBadge,
  footerAction,
  iconRailStart,
  className,
  collateralSymbol,
  hideTradeActions,
  optionYesLabel,
  optionNoLabel,
  impressionSurface,
  impressionPosition = 0,
  expandedFooter,
}: MarketCardProps) {
  // Analytics scope: onchain markets only. A card is considered onchain
  // when source is pm-AMM (`pamm`) or the legacy `marketTypeTag` flags
  // a predit market as `pamm_onchain`.
  const isOnchain = source === 'pamm' || marketTypeTag === 'pamm_onchain';
  const impressionRef = useMarketCardImpression({
    marketId: id,
    marketType: sourceToMarketType(source),
    surface: impressionSurface ?? '',
    position: impressionPosition,
    enabled: !!impressionSurface && isOnchain,
  });

  // When the price is unknown, keep the bar visually neutral (centered) but
  // render a dash for the numbers so we don't imply a real 50/50.
  const hasPrice = typeof yesPct === 'number' && Number.isFinite(yesPct);
  const yesNum = hasPrice ? (yesPct as number) : 50;
  const yes = pct(yesNum);
  const no = 100 - yes;
  const vol = fmtVol(volume, collateralSymbol);
  const date = fmtDate(endDate);
  const hasBook = source === 'kalshi' && (yesBid != null || yesAsk != null);
  const disabled = isTrading || !isUserLoggedIn;

  // Every card renders the probability as a percent (`72.15%`). Kalshi
  // keeps its best-ask price (already in cents).
  const yesLabel =
    source === 'kalshi' && yesAsk
      ? cents(yesAsk)
      : !hasPrice
        ? '—'
        : fmtPct(yes);
  const noLabel =
    source === 'kalshi' && noAsk
      ? cents(noAsk)
      : !hasPrice
        ? '—'
        : fmtPct(no);

  return (
    <div
      ref={impressionRef}
      className={`card-order group flex h-full flex-col rounded-lg border border-border bg-card cursor-pointer transition-all duration-200 ${className || ''}`}
      onClick={onCardClick}
    >
      <div
        className={
          expandedFooter
            ? 'flex flex-1 flex-col p-3'
            : 'flex-1 p-3'
        }
      >
        {/* Header */}
        <div className={`flex ${expandedFooter ? 'gap-2.5' : 'gap-3'}`}>
          <div className="relative shrink-0">
            {imageUrl ? (
              <div
                className={`${expandedFooter ? 'w-9 h-9' : 'w-14 h-14'} rounded-lg overflow-hidden bg-muted`}
              >
                <ImageWithFallback
                  src={imageUrl}
                  alt={question}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div
                className={`${expandedFooter ? 'w-9 h-9' : 'w-14 h-14'} rounded-lg bg-muted flex items-center justify-center`}
              >
                <BarChart3
                  className={`${expandedFooter ? 'w-4 h-4' : 'w-5 h-5'} text-muted-foreground/50`}
                />
              </div>
            )}
            {!expandedFooter && (
              <div className="absolute -bottom-1 -right-1 bg-card border border-[color-mix(in_srgb,var(--brand-green)_30%,transparent)] rounded px-1 py-0.5">
                <span className="text-[10px] font-bold data-cell text-success">
                  {hasPrice ? fmtPct(yes) : '—'}
                </span>
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="mb-1 flex items-start justify-between gap-2 min-h-3.5">
              <div className="flex flex-wrap items-center gap-1 min-w-0">
                {marketTypeTag && !hideTypeTag && (
                  <span
                    className={`text-[8px] font-bold uppercase tracking-widest px-1 py-px rounded ${TYPE_TAG_STYLES[marketTypeTag]}`}
                  >
                    {TYPE_TAG_LABEL[marketTypeTag]}
                  </span>
                )}
                {customBadge}
                {status && status !== 'open' && status !== 'active' && (
                  <Badge
                    variant={getStatusBadgeProps(status).variant}
                    className={`text-[8px] font-bold uppercase px-1 py-0 h-3.5 ${getStatusBadgeProps(status).className}`}
                  >
                    {status.replace('_', ' ')}
                  </Badge>
                )}
                {outcome && (
                  <span
                    className={`text-[8px] font-bold px-1 py-px rounded ${
                      outcome === 'yes'
                        ? 'bg-success/20 text-success'
                        : 'bg-danger/20 text-danger'
                    }`}
                  >
                    {outcome.toUpperCase()}
                  </span>
                )}
                {isOrdered && (
                  <span className="text-[8px] font-bold text-primary bg-primary/15 px-1.5 py-0.5 rounded uppercase tracking-wider">
                    Order Active
                  </span>
                )}
              </div>
              {/* Deadline hoisted out of the footer strip — a live countdown
                  (timeRemaining) wins over the coarse end-date when both are
                  set (QuickMarketCard passes both). */}
              {expandedFooter && (
                <Deadline
                  timeRemaining={timeRemaining}
                  countdownTo={countdownTo}
                  date={date}
                />
              )}
            </div>

            <h4
              className={`${expandedFooter ? 'text-[13px]' : 'text-[12.5px]'} font-semibold leading-[1.35] line-clamp-2 min-h-[32px] group-hover:text-foreground transition-colors`}
            >
              {question}
            </h4>

            {/* Time counter moved to the tags row for expandedFooter cards;
                only keep the subtitle line here. Compact variant still shows
                both under the title as before. */}
            <SubtitleRow
              subtitle={subtitle}
              timeRemaining={expandedFooter ? undefined : timeRemaining}
              countdownTo={expandedFooter ? undefined : countdownTo}
            />
          </div>
        </div>

        {/* Probability display — inline Yes/No pills for expandedFooter
            (matches /market mockup), progress bar for the compact variant.
            Single-outcome pills are intentionally bigger than the compact
            quick-trade rows inside multi-outcome group cards, so binary
            markets get the visual weight of a primary CTA. */}
        {expandedFooter ? (
          !hideTradeActions && (
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {/* Mockup `.claim-buy` — transparent surface + hair ring;
                  hover reveals colored fill + colored ring. Labels/prices
                  stay green/red at rest so the card still reads binary. */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onYesClick?.(e);
                }}
                disabled={disabled || !onYesClick}
                className="flex flex-col items-start gap-0.5 rounded-md bg-transparent px-2.5 py-2 text-left shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] transition-colors hover:bg-success/10 hover:shadow-[inset_0_0_0_1px_rgba(34,209,126,0.45)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="font-mono text-[9px] font-extrabold uppercase tracking-[0.1em] text-success">
                  Buy {optionYesLabel ?? 'Yes'}
                </span>
                <span className="font-mono text-[14px] font-bold leading-none tabular-nums text-foreground">
                  {yesLabel}
                </span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onNoClick?.(e);
                }}
                disabled={disabled || !onNoClick}
                className="flex flex-col items-start gap-0.5 rounded-md bg-transparent px-2.5 py-2 text-left shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] transition-colors hover:bg-danger/10 hover:shadow-[inset_0_0_0_1px_rgba(255,87,87,0.45)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="font-mono text-[9px] font-extrabold uppercase tracking-[0.1em] text-danger">
                  Buy {optionNoLabel ?? 'No'}
                </span>
                <span className="font-mono text-[14px] font-bold leading-none tabular-nums text-foreground">
                  {noLabel}
                </span>
              </button>
            </div>
          )
        ) : (
          <div className="mt-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold data-cell text-success">
                {optionYesLabel ?? 'Yes'} {hasPrice ? fmtPct(yes) : '—'}
              </span>
              <span className="text-[10px] font-bold data-cell text-danger">
                {optionNoLabel ?? 'No'} {hasPrice ? fmtPct(no) : '—'}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-white/10 progress-bar-spark">
              <div
                className="h-full bg-success rounded-full transition-all duration-500 bar-fill"
                style={{ width: `${yes}%` }}
              />
            </div>
          </div>
        )}

        {/* Statistics — no divider above the strip (per design feedback);
            deadline lives up in the tags row now. */}
        {expandedFooter ? (
          <div className="mt-auto flex items-center justify-between gap-2 pt-2.5 text-[11px] text-muted-foreground">
            <div className="flex min-w-0 items-center gap-3">
              {vol && (
                <span
                  className="inline-flex items-center gap-1 truncate data-cell text-[13px] font-bold text-foreground"
                  title="Volume"
                >
                  <span className="text-[13px] font-bold text-success">
                    $
                  </span>
                  {/* fmtVol prepends its own $, drop it so the coloured glyph
                      above isn't rendered twice. */}
                  {vol.startsWith('$') ? vol.slice(1) : vol}
                </span>
              )}
              {!!participants && (
                <span
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
                  title="Traders"
                >
                  <Users className="w-3 h-3" />
                  {participants}
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1 opacity-60 transition-opacity group-hover:opacity-100">
              {iconRailStart}
              {onChatClick && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      aria-label="Discuss market"
                      className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        onChatClick(e);
                      }}
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Discuss</TooltipContent>
                </Tooltip>
              )}
              {(source === 'pamm' || onShareClick) && (
                <PammShareButton
                  url={`/market/${id}`}
                  question={question}
                  size="sm"
                  variant="icon"
                />
              )}
            </div>
          </div>
        ) : (
          <div className="mt-2.5 flex items-center justify-between text-[10px] text-muted-foreground">
            <div className="flex items-center gap-2.5">
              {vol && (
                <span className="flex items-center gap-1 data-cell font-medium">
                  <BarChart3 className="w-3 h-3" />
                  {vol}
                </span>
              )}
              {!!participants && (
                <span className="flex items-center gap-0.5">
                  <Users className="w-3 h-3" />
                  {participants}
                </span>
              )}
              {date && (
                <span className="flex items-center gap-0.5">
                  <Clock className="w-3 h-3" />
                  {date}
                </span>
              )}
            </div>
            <div className="flex items-center gap-0.5">
              {iconRailStart}
              {onChatClick && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className="p-1 rounded hover:bg-muted transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        onChatClick(e);
                      }}
                    >
                      <MessageSquare className="w-3 h-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Chat with AI</TooltipContent>
                </Tooltip>
              )}
              {(source === 'pamm' || onShareClick) && (
                <PammShareButton
                  url={`/market/${id}`}
                  question={question}
                  size="sm"
                  variant="icon"
                />
              )}
            </div>
          </div>
        )}

        {/* Order book (Kalshi only) */}
        {hasBook && (
          <div className="flex items-center gap-3 text-[10px] mt-1">
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Yes</span>
              <span className="data-cell font-semibold text-success">
                {yesBid ? cents(yesBid) : '--'}
              </span>
              <span className="text-muted-foreground">/</span>
              <span className="data-cell font-semibold text-success">
                {yesAsk ? cents(yesAsk) : '--'}
              </span>
            </div>
            <span className="text-border">|</span>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">No</span>
              <span className="data-cell font-semibold text-danger">
                {noBid ? cents(noBid) : '--'}
              </span>
              <span className="text-muted-foreground">/</span>
              <span className="data-cell font-semibold text-danger">
                {noAsk ? cents(noAsk) : '--'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Trade buttons — expandedFooter renders inline pills above; skip here. */}
      {!expandedFooter && !hideTradeActions && (onYesClick || onNoClick) && (
        <div className="grid grid-cols-2 gap-px bg-border border-t border-border rounded-b-lg overflow-hidden">
          <button
            className="h-9 text-[11px] font-bold uppercase tracking-wide text-success bg-gradient-to-t from-success/15 to-success/5 hover:from-success/25 hover:to-success/10 transition-all disabled:opacity-20 disabled:cursor-not-allowed"
            onClick={(e) => {
              e.stopPropagation();
              onYesClick?.(e);
            }}
            disabled={disabled}
          >
            {optionYesLabel ?? 'Yes'}{' '}
            <span className="data-cell ml-0.5">{yesLabel}</span>
          </button>
          <button
            className="h-9 text-[11px] font-bold uppercase tracking-wide text-danger bg-gradient-to-t from-danger/15 to-danger/5 hover:from-danger/25 hover:to-danger/10 transition-all disabled:opacity-20 disabled:cursor-not-allowed"
            onClick={(e) => {
              e.stopPropagation();
              onNoClick?.(e);
            }}
            disabled={disabled}
          >
            {optionNoLabel ?? 'No'}{' '}
            <span className="data-cell ml-0.5">{noLabel}</span>
          </button>
        </div>
      )}

      {/* Custom footer action (e.g. claim fee row) */}
      {footerAction && (
        <div
          className="border-t border-border rounded-b-lg overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {footerAction}
        </div>
      )}
    </div>
  );
}

/** `timeRemaining`, or the live countdown when the card was given `countdownTo`. */
function useTimeLabel(
  timeRemaining: string | undefined,
  countdownTo: MarketCardProps['countdownTo'],
): string | undefined {
  const live = useCountdown(countdownTo?.targetMs, !!countdownTo?.active);
  return countdownTo ? live : timeRemaining;
}

/** The deadline in the tags row (expandedFooter): the countdown, else the end date. */
function Deadline({
  timeRemaining,
  countdownTo,
  date,
}: {
  timeRemaining?: string;
  countdownTo?: MarketCardProps['countdownTo'];
  date?: string | null;
}) {
  const label = useTimeLabel(timeRemaining, countdownTo) || date;
  if (!label) return null;
  return (
    <span
      className="ml-auto inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[10px] font-medium text-muted-foreground"
      title="Deadline"
      // Relative to now and the viewer's time zone: a server-rendered page
      // says it as of then, where it was rendered.
      suppressHydrationWarning
    >
      <Clock className="h-3 w-3" />
      {label}
    </span>
  );
}

/** The line under the title: the subtitle, and (compact cards) the countdown. */
function SubtitleRow({
  subtitle,
  timeRemaining,
  countdownTo,
}: {
  subtitle?: string;
  timeRemaining?: string;
  countdownTo?: MarketCardProps['countdownTo'];
}) {
  const label = useTimeLabel(timeRemaining, countdownTo);
  if (!subtitle && !label) return null;
  return (
    <div className="flex items-center gap-2 mt-1 h-4">
      {subtitle && (
        <p className="text-[10px] text-muted-foreground truncate">{subtitle}</p>
      )}
      {label && (
        <span className="text-[10px] text-muted-foreground whitespace-nowrap" suppressHydrationWarning>
          {label}
        </span>
      )}
    </div>
  );
}
