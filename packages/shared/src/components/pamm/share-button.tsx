'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Check, Copy, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { useShareUrl } from '@/utils/referral-link';

// ─── Icons ───────────────────────────────────────────────────────────────────

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current shrink-0">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.742l7.73-8.835L1.254 2.25H8.08l4.259 5.63L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current shrink-0">
      <path d="M11.944 0A12 12 0 1 0 24 12 12.012 12.012 0 0 0 11.944 0zm5.48 8.177-2.013 9.474c-.146.66-.537.82-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.604.295l.213-3.053 5.561-5.022c.242-.214-.054-.334-.373-.12l-6.874 4.33-2.963-.924c-.643-.204-.656-.643.136-.953l11.57-4.461c.536-.194 1.005.13.878.742z" />
    </svg>
  );
}

// ─── Responsive hook ─────────────────────────────────────────────────────────

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);
  return isMobile;
}

// ─── Share panel content ─────────────────────────────────────────────────────

interface SharePanelProps {
  question: string;
  shareUrl: string;
  tweetText: string;
  telegramText: string;
}

function SharePanel({
  question,
  shareUrl,
  tweetText,
  telegramText,
}: SharePanelProps) {
  const [copied, setCopied] = useState(false);

  const handleX = () => {
    window.open(
      `https://x.com/intent/tweet?text=${encodeURIComponent(tweetText)}`,
      '_blank',
      'noopener,noreferrer',
    );
  };

  const handleTelegram = () => {
    window.open(
      `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(telegramText)}`,
      '_blank',
      'noopener,noreferrer',
    );
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success('Link copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const itemCls =
    'flex items-center gap-3.5 w-full rounded-xl border border-border bg-muted/20 px-4 py-3.5 text-[13px] font-semibold transition-colors hover:bg-muted/50 cursor-pointer';

  return (
    <div className="space-y-2.5">
      {/* Market preview */}
      <p className="text-[12px] text-muted-foreground leading-snug line-clamp-2 pb-1">
        {question}
      </p>

      <button onClick={handleX} className={itemCls}>
        <XIcon />
        Post on X (Twitter)
      </button>

      <button onClick={handleTelegram} className={itemCls}>
        <TelegramIcon />
        Share on Telegram
      </button>

      <button onClick={handleCopy} className={itemCls}>
        {copied ? (
          <Check className="h-4 w-4 text-success shrink-0" />
        ) : (
          <Copy className="h-4 w-4 shrink-0" />
        )}
        {copied ? 'Copied!' : 'Copy link'}
      </button>
    </div>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

interface PammShareButtonProps {
  /** Relative or absolute URL to share. */
  url: string;
  question: string;
  /** When provided, uses the trader copy template — the market's own custom
   * outcome label (e.g. "TRUMP"), not necessarily literal "YES"/"NO". */
  side?: string;
  size?: 'sm' | 'md';
  variant?: 'icon' | 'icon-text';
  className?: string;
}

export function PammShareButton({
  url,
  question,
  side,
  size = 'md',
  variant = 'icon-text',
  className = '',
}: PammShareButtonProps) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();

  // Previously this appended ?ref=<first 6 chars of the wallet pubkey>, which
  // nothing on the receiving end ever read. The referral code is the value the
  // invite-code system actually tracks.
  const shareUrl = useShareUrl(url);

  // `question` is typed as required, but it is threaded through several list /
  // portfolio payloads where the field can be missing at runtime. A share
  // button must never be the thing that takes a page down, so treat a missing
  // title as "no title" rather than trusting the type.
  const safeQuestion = typeof question === 'string' ? question.trim() : '';
  const shortQ =
    safeQuestion.length > 80 ? `${safeQuestion.slice(0, 77)}…` : safeQuestion;
  const subject = shortQ ? `🎯 "${shortQ}"` : 'this market';
  const tweetText = side
    ? `I'm betting ${side} on ${subject} @predit_market — join me → ${shareUrl}`
    : `I just launched ${subject} on @predit_market — bet on YES/NO now → ${shareUrl}`;
  const telegramText = side
    ? `Betting ${side} on: ${shortQ || 'this market'}`
    : shortQ || 'this market';

  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5';
  const triggerCls = [
    'flex items-center gap-1.5 font-mono uppercase tracking-widest transition-colors',
    'text-muted-foreground hover:text-foreground cursor-pointer',
    size === 'sm' ? 'text-[9.5px]' : 'text-[11px]',
    className,
  ].join(' ');

  const panelProps: SharePanelProps = {
    question: safeQuestion,
    shareUrl,
    tweetText,
    telegramText,
  };

  return (
    <>
      <button
        type="button"
        className={triggerCls}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Share2 className={iconSize} />
        {variant === 'icon-text' && 'Share'}
      </button>

      {/* Desktop: Dialog */}
      {!isMobile && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-[15px]">Share market</DialogTitle>
            </DialogHeader>
            <SharePanel {...panelProps} />
          </DialogContent>
        </Dialog>
      )}

      {/* Mobile: Drawer */}
      {isMobile && (
        <Drawer open={open} onOpenChange={setOpen} direction="bottom">
          <DrawerContent className="border-border bg-card px-4 pb-6">
            <DrawerHeader className="px-0 pt-4 pb-3">
              <DrawerTitle className="text-[15px]">Share market</DrawerTitle>
            </DrawerHeader>
            <SharePanel {...panelProps} />
          </DrawerContent>
        </Drawer>
      )}
    </>
  );
}
