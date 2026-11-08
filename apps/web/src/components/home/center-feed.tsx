'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { BarChart3, ChevronLeft, ChevronRight, ImagePlus, Loader2, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import useAuthStore from '@/store/auth.store';
import { useAppShellStore } from '@/store/app-shell-store';
import { usePostsFeed } from '@/hooks/use-posts-feed';
import { postAuthorOf, useCreatePost } from '@/hooks/use-create-post';
import { useMySocialProfile } from '@/hooks/v2/use-my-social-profile';
import { uploadFile } from '@/services/file.service';
import { UserAvatar } from '@/components/v2';
import type { PostMedia } from '@/types/feed';
import { FeedPost } from './feed-post';
import { FailedPosts } from './failed-posts';
import { FeedItemSkeleton } from './feed-states';
import { MixedFeed } from './mixed-feed';
import { PumpLaunchFeed } from './pump/pump-launch-feed';
import { usePumpEnabled } from '@/hooks/v2/use-pump-feed';
import type { PumpToken } from '@/lib/v2/pump';

const TABS = ['Feed', 'For you', 'Saved', 'Launches'] as const;
type Tab = (typeof TABS)[number];

const MAX_ATTACHMENTS = 4;
const ACCEPTED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

interface CenterFeedProps {
  leftCollapsed?: boolean;
  onExpandLeft?: () => void;
  rightCollapsed?: boolean;
  onExpandRight?: () => void;
  /** Called when a feed row wants to open its thread view (reply icon or
   *  clicking the post body). Parent (HomeShell) swaps center mode. */
  onOpenThread?: (post: Extract<import('@/types/feed').FeedItem, { kind: 'post' }>) => void;
  /** Opens a new Predit AI chat in the center slot. Shown below lg, where
   *  the AI rail is hidden. */
  onOpenAi?: () => void;
  /** Opens a token just launched on pump.fun to trade, in the center. */
  onOpenPump?: (token: PumpToken) => void;
  /**
   * Where the Predit AI column starts showing (it sits further right once
   * the New tokens column is there): the AI button here hides from then on.
   */
  aiColumnFrom?: 'lg' | 'xl';
}

/** From lg the home has its own New tokens column; Launches is for phones. */
const LAUNCHES_HIDDEN_FROM = '(min-width: 1024px)';

interface Draft {
  text: string;
  media: PostMedia[];
  /** Local blob URLs shown while uploading so the chip appears instantly. */
  pending: Array<{ id: string; previewUrl: string }>;
}

/**
 * Center column of the the Home (`/`) shell — Phase 01 home-feeds.
 * Tabs (Feed | For you | Saved), real posts, compose bar with multiline
 * textarea + image attachments (up to 4). Enter inserts newline;
 * Cmd/Ctrl+Enter submits so `Post` isn't the only submit path.
 */
export function CenterFeed({
  leftCollapsed = false,
  onExpandLeft,
  rightCollapsed = false,
  onExpandRight,
  onOpenThread,
  onOpenAi,
  onOpenPump,
  aiColumnFrom = 'lg',
}: CenterFeedProps = {}) {
  const [picked, setTab] = useState<Tab>('Feed');
  // Widened past lg on Launches: the column shows the same, so back to Feed.
  useEffect(() => {
    const wide = window.matchMedia(LAUNCHES_HIDDEN_FROM);
    const onChange = () => {
      if (wide.matches) setTab((t) => (t === 'Launches' ? 'Feed' : t));
    };
    onChange();
    wide.addEventListener('change', onChange);
    return () => wide.removeEventListener('change', onChange);
  }, []);
  // Launches (pump.fun), below lg only, needs somewhere to open a token, and
  // goes when an admin switches the feed off.
  // Off by default: shown only once BE says the feed is on.
  const pumpOn = usePumpEnabled() === true;
  const launchesOn = !!onOpenPump && pumpOn;
  const tabs = launchesOn ? TABS : TABS.filter((t) => t !== 'Launches');
  const tab: Tab = !launchesOn && picked === 'Launches' ? 'Feed' : picked;
  const { user } = useAuthStore();
  // Names the optimistic row as the server will (profile name / @handle).
  const myProfile = useMySocialProfile();
  const setOpen = useAppShellStore((s) => s.setOpen);

  // Only the Saved tab lists posts here; the others are MixedFeed's.
  const feed = usePostsFeed({ saved: true, enabled: tab === 'Saved' });
  const create = useCreatePost();
  const [draft, setDraft] = useState<Draft>({ text: '', media: [], pending: [] });
  const [uploading, setUploading] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-grow textarea so the compose box never internally scrolls;
  // it just gets taller as the user types. Re-measure whenever the
  // draft body changes (or empties after submit).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft.text]);

  const submitPost = () => {
    const content = draft.text.trim();
    if (!content && draft.media.length === 0) return;
    if (!user) {
      setOpen('walletConnectOpen', true);
      return;
    }
    if (content.length > 500) {
      toast.error('Post is too long (max 500 chars)');
      return;
    }
    if (uploading > 0) return;

    const payload = { content, media: draft.media };
    setDraft({ text: '', media: [], pending: [] });
    create.mutate({ ...payload, author: postAuthorOf(user, myProfile) });
  };

  // A post the outbox gave up on, sent again as itself (same Idempotency-Key).
  const retryFailed = ({ request, idempotencyKey }: Parameters<
    React.ComponentProps<typeof FailedPosts>['onRetry']
  >[0]) => {
    if (!user) {
      setOpen('walletConnectOpen', true);
      return;
    }
    create.mutate({ ...request, clientId: idempotencyKey, author: postAuthorOf(user, myProfile) });
  };

  const pickImages = () => {
    if (!user) {
      setOpen('walletConnectOpen', true);
      return;
    }
    fileInputRef.current?.click();
  };

  const onFilesChosen = async (evt: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(evt.target.files ?? []);
    evt.target.value = '';
    if (files.length === 0) return;

    const remaining = MAX_ATTACHMENTS - draft.media.length - draft.pending.length;
    if (remaining <= 0) {
      toast.error(`Max ${MAX_ATTACHMENTS} images`);
      return;
    }
    const toUpload = files.slice(0, remaining).filter((f) => {
      if (!ACCEPTED_MIMES.has(f.type)) {
        toast.error(`Unsupported: ${f.name}`);
        return false;
      }
      return true;
    });

    for (const file of toUpload) {
      const id = crypto.randomUUID();
      const previewUrl = URL.createObjectURL(file);
      setDraft((d) => ({ ...d, pending: [...d.pending, { id, previewUrl }] }));
      setUploading((n) => n + 1);
      try {
        const { file: uploaded } = await uploadFile(file);
        // Best-effort dimensions from the preview so grid layout can honor aspect.
        const dims = await readImageDims(previewUrl).catch(() => null);
        const item: PostMedia = {
          url: uploaded.path,
          mime: file.type,
          width: dims?.w,
          height: dims?.h,
        };
        setDraft((d) => ({
          ...d,
          media: [...d.media, item],
          pending: d.pending.filter((p) => p.id !== id),
        }));
      } catch {
        toast.error(`Upload failed: ${file.name}`);
        setDraft((d) => ({ ...d, pending: d.pending.filter((p) => p.id !== id) }));
      } finally {
        URL.revokeObjectURL(previewUrl);
        setUploading((n) => n - 1);
      }
    }
  };

  const removeMedia = (idx: number) => {
    setDraft((d) => ({ ...d, media: d.media.filter((_, i) => i !== idx) }));
  };

  const isEmpty = !feed.isLoading && feed.items.length === 0;
  const totalAttached = draft.media.length + draft.pending.length;

  return (
    <div className="flex flex-col min-w-0">
      {/* Sticky tab bar */}
      <div className="sticky top-[calc(40px+var(--nav-y,0px))] z-10 h-[44px] flex items-stretch gap-4 sm:gap-6 border-b border-border/60 bg-background/68 backdrop-blur-[24px] backdrop-saturate-[180%] px-5">
        {leftCollapsed && (
          <button
            type="button"
            onClick={onExpandLeft}
            aria-label="Expand sidebar"
            className="touch-hit self-center text-muted-foreground hover:text-white -ml-1 mr-1"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`relative inline-flex items-center whitespace-nowrap px-0.5 text-[14px] leading-none cursor-pointer transition-colors ${
              t === 'Launches' ? 'lg:hidden' : ''
            } ${
              tab === t ? 'text-white font-bold' : 'text-muted-foreground font-medium hover:text-white'
            }`}
          >
            {t}
            {tab === t && <span className="absolute left-0 right-0 bottom-0 h-px bg-success" />}
          </button>
        ))}
        {rightCollapsed && (
          <button
            type="button"
            onClick={onExpandRight}
            aria-label="Expand Predit AI"
            title="Expand Predit AI"
            className="touch-hit self-center ml-auto text-muted-foreground hover:text-white"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        )}
        {/* Mobile stand-ins for the rails: markets rail is hidden below md,
            the Predit AI rail below lg. */}
        <span
          className={`ml-auto self-center flex items-center gap-1.5 ${aiColumnFrom === 'xl' ? 'xl:hidden' : 'lg:hidden'}`}
        >
          <Link prefetch={false}
            href="/markets"
            aria-label="Markets"
            className="touch-hit md:hidden inline-flex items-center justify-center w-7 h-7 rounded-md text-white/55 hover:text-white hover:bg-white/6"
          >
            <BarChart3 className="w-4 h-4" />
          </Link>
          {onOpenAi && (
            <button
              type="button"
              onClick={onOpenAi}
              aria-label="Ask Predit AI"
              className="touch-hit inline-flex items-center justify-center w-7 h-7 rounded-md text-primary bg-primary/10 hover:bg-primary/18"
            >
              <Sparkles className="w-4 h-4" />
            </button>
          )}
        </span>
      </div>

      {/* Compose bar — not on Launches, which nobody posts to. */}
      {tab !== 'Launches' && (
        <>
        <div className="flex gap-3 px-5 py-3 bg-muted/40 border-b border-border/60">
          <div className="pt-1 flex-shrink-0">
            <UserAvatar
              address={user?.id ?? user?.username ?? 'guest'}
              size={40}
              photoUrl={user?.avatar ?? null}
            />
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <textarea
              ref={textareaRef}
              value={draft.text}
              onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  submitPost();
                }
              }}
              maxLength={500}
              rows={2}
              placeholder="Post a take, share a trade, ask the crowd"
              className="w-full bg-transparent border-none outline-none text-white text-[16px] lg:text-[14px] placeholder:text-muted-foreground resize-none overflow-hidden leading-[1.5]"
            />
            {totalAttached > 0 && (
              <div className="flex gap-2 flex-wrap">
                {draft.media.map((m, i) => (
                  <div
                    key={m.url}
                    className="relative w-16 h-16 rounded-md overflow-hidden bg-muted border border-border"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.url} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeMedia(i)}
                      aria-label="Remove image"
                      className="absolute top-0.5 right-0.5 w-4 h-4 after:absolute after:-inset-3 after:content-[''] rounded-full bg-black/70 hover:bg-black flex items-center justify-center text-white"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
                {draft.pending.map((p) => (
                  <div
                    key={p.id}
                    className="relative w-16 h-16 rounded-md overflow-hidden bg-muted border border-border"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.previewUrl} alt="" className="w-full h-full object-cover opacity-60" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Loader2 className="w-4 h-4 text-white animate-spin" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                hidden
                onChange={onFilesChosen}
              />
              <button
                type="button"
                onClick={pickImages}
                disabled={totalAttached >= MAX_ATTACHMENTS}
                title="Attach images"
                aria-label="Attach images"
                className="touch-hit inline-flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-white hover:bg-accent/70 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ImagePlus className="w-4 h-4" />
              </button>
              <span className="ml-auto flex items-center gap-2">
                {draft.text.length > 400 && (
                  <span
                    className={`[font-family:var(--font-mono)] text-[10px] ${
                      draft.text.length >= 500 ? 'text-danger' : 'text-muted-foreground'
                    }`}
                  >
                    {500 - draft.text.length}
                  </span>
                )}
                <button
                  type="button"
                  onClick={submitPost}
                  disabled={(!draft.text.trim() && draft.media.length === 0) || create.isPending || uploading > 0}
                  className="px-4 py-1.5 rounded-full bg-primary text-background font-bold text-[12px] cursor-pointer hover:bg-primary/85 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                >
                  {create.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                  Post
                </button>
              </span>
            </div>
          </div>
        </div>

        <FailedPosts onRetry={retryFailed} />
        </>
      )}

      {/* Feed body — posts mixed with trades: For you is the people the
          viewer follows, Feed is everyone; Saved is bookmarked posts;
          Launches is pump.fun's new tokens, live. */}
      {tab === 'Launches' && onOpenPump ? (
        <PumpLaunchFeed onOpen={onOpenPump} />
      ) : tab !== 'Saved' ? (
        <MixedFeed
          key={tab}
          scope={tab === 'For you' ? 'following' : 'all'}
          onOpenThread={onOpenThread}
        />
      ) : (
        <div className="flex flex-col">
          {feed.isLoading && <FeedItemSkeleton count={4} />}
          {feed.isError && !feed.isLoading && (
            <div className="px-5 py-16 text-center text-[13px] text-muted-foreground">
              Failed to load feed.{' '}
              <button
                type="button"
                onClick={() => feed.refetch()}
                className="text-primary underline"
              >
                Retry
              </button>
            </div>
          )}
          {isEmpty && !feed.isError && (
            <div className="px-5 py-16 text-center text-[13px] text-muted-foreground">
              {user
                ? 'No saved posts. Tap the bookmark icon on a post to save it here.'
                : 'Sign in to see your saved posts.'}
            </div>
          )}
          {feed.items.map((item) => (
            <FeedPost
              key={
                item.kind === 'post' && item.repostedBy
                  ? `${item.id}:repost:${item.repostedBy.id}`
                  : item.id
              }
              item={item}
              onOpenThread={
                onOpenThread && item.kind === 'post'
                  ? () => onOpenThread(item)
                  : undefined
              }
            />
          ))}
          {feed.hasNextPage && (
            <button
              type="button"
              onClick={() => feed.fetchNextPage()}
              disabled={feed.isFetchingNextPage}
              className="mx-5 my-4 py-2 rounded-md border border-border text-[12px] text-foreground/80 hover:bg-muted/60 disabled:opacity-40"
            >
              {feed.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

async function readImageDims(url: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = reject;
    img.src = url;
  });
}
