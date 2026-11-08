'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import {
  MessageCircle,
  Repeat,
  Heart,
  Bookmark,
  Clock,
  BadgeCheck,
  MoreHorizontal,
  Trash2,
  Play,
} from 'lucide-react';
import useAuthStore from '@/store/auth.store';
import { useAppShellStore } from '@/store/app-shell-store';
import {
  useDeletePost,
  useToggleLike,
  useToggleRepost,
  useToggleSave,
} from '@/hooks/use-post-engagement';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useOutboxPending } from '@/store/outbox.store';
import { UserAvatar } from '@/components/v2';
import { displayName } from '@/lib/display-name';
import { profilePath } from '@/lib/v2/social';
import { XLogo, xProfileUrl } from '@/components/shared/x-logo';
import { tokenizeContent } from '@/lib/linkify';
import { playableVideoUrl } from '@/lib/x-media';
import type {
  ExternalQuote,
  FeedItem,
  LinkPreview,
  PostCounts,
  PostMedia,
} from '@/types/feed';

type PostItem = Extract<FeedItem, { kind: 'post' }>;

interface FeedPostProps {
  item: FeedItem;
  /** Called when the user clicks the reply icon or the post body — the
   *  parent shell swaps center to thread view. If absent, the reply
   *  icon and body clicks are inert (used inside ThreadView itself). */
  onOpenThread?: () => void;
  /** Called after the viewer deleted this post (ThreadView closes). */
  onDeleted?: () => void;
}

/**
 * Universal feed card. Phase 01 only renders the `post` variant; later
 * phases (03–06) add trade + take variants. Kinds not yet wired render
 * a fallback stub so a stray item from a future phase never crashes.
 */
export function FeedPost({ item, onOpenThread, onDeleted }: FeedPostProps) {
  if (item.kind === 'post')
    return <PostVariant item={item} onOpenThread={onOpenThread} onDeleted={onDeleted} />;
  return null;
}

function PostVariant({
  item,
  onOpenThread,
  onDeleted,
}: {
  item: PostItem;
  onOpenThread?: () => void;
  onDeleted?: () => void;
}) {
  // A write to this post (or the post itself) waits in the offline outbox.
  const pending = useOutboxPending(item.id);
  const { user } = useAuthStore();
  // Not on a post still waiting to be sent: it has no server id yet.
  const isOwn = !!user && user.id === item.author.id && !pending;
  return (
    <article
      className={`px-5 py-3.5 border-b border-border/60 hover:bg-muted/40 transition-colors ${
        onOpenThread ? 'cursor-pointer' : ''
      }`}
      onClick={(e) => {
        if (
          !onOpenThread ||
          (e.target as HTMLElement).closest('button, a, textarea, input, video')
        )
          return;
        onOpenThread();
      }}
    >
      {item.repostedBy && (
        <div className="pl-[52px] flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1.5">
          <Repeat className="w-3 h-3" />
          <span>{displayName(item.repostedBy)} reposted</span>
        </div>
      )}
      <div className="grid grid-cols-[44px_1fr] gap-3">
      {item.author.handle ? (
        // Opens the author's profile — follow from there, X KOLs included.
        <Link prefetch={false}
          href={profilePath(item.author.handle)}
          aria-label={authorName(item.author)}
          className="self-start"
        >
          {/* Seeded by the handle, as on the profile and the author's trades. */}
          <UserAvatar address={item.author.handle} size={40} photoUrl={item.author.avatar} />
        </Link>
      ) : (
        <UserAvatar address={item.author.id} size={40} photoUrl={item.author.avatar} />
      )}
      <div className="flex flex-col gap-1.5 min-w-0">
        <PostHeader
          name={authorName(item.author)}
          href={item.author.handle ? profilePath(item.author.handle) : undefined}
          handle={item.author.handle ?? null}
          tierRank={item.author.tierRank ?? null}
          tier={item.author.tier ?? null}
          createdAt={item.createdAt}
          pending={pending}
          fromX={item.source === 'x'}
          kol={!!item.author.isVirtual}
          menu={isOwn ? <PostMenu item={item} onDeleted={onDeleted} /> : null}
        />
        {item.content && (
          <div className="text-[14px] leading-[1.45] text-white whitespace-pre-wrap break-words">
            <PostContent text={item.content} fromX={item.source === 'x'} />
          </div>
        )}
        {item.media && item.media.length > 0 && <MediaGrid media={item.media} />}
        {item.linkPreview && <LinkPreviewCard preview={item.linkPreview} />}
        {item.externalQuote && <ExternalQuoteCard quote={item.externalQuote} />}
        <PostActions item={item} onOpenThread={onOpenThread} />
      </div>
      </div>
    </article>
  );
}

const LINK_CLASS = 'text-primary hover:underline';

/** Post text with links (and, on posts from X, @mentions) made clickable. */
function PostContent({ text, fromX }: { text: string; fromX: boolean }) {
  return (
    <>
      {tokenizeContent(text, { mentions: fromX }).map((t, i) => {
        if (t.type === 'text') return t.value;
        const href = t.type === 'link' ? t.href : xProfileUrl(t.handle);
        return (
          <a
            key={i}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            title={t.type === 'link' ? t.href : undefined}
            className={LINK_CLASS}
          >
            {t.type === 'link' ? t.label : `@${t.handle}`}
          </a>
        );
      })}
    </>
  );
}

/** Card for the link a post shares, laid out like X's: a wide image with
 *  the title over it and the site below, or a thumbnail beside the text. */
function LinkPreviewCard({ preview }: { preview: LinkPreview }) {
  const { url, title, description, domain, image, large } = preview;
  if (large && image) {
    return (
      <div className="mt-1">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="relative block rounded-xl overflow-hidden border border-border/80 bg-muted"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.url}
            alt=""
            loading="lazy"
            className="w-full aspect-[1.91/1] object-cover"
          />
          <span className="absolute left-3 bottom-3 max-w-[calc(100%-24px)] truncate rounded-[4px] bg-black/70 px-1.5 py-0.5 text-[12.5px] text-white">
            {title}
          </span>
        </a>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-block text-[12px] text-muted-foreground hover:underline"
        >
          From {domain}
        </a>
      </div>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1 flex rounded-xl overflow-hidden border border-border/80 hover:bg-muted/40 transition-colors"
    >
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image.url}
          alt=""
          loading="lazy"
          className="w-[104px] sm:w-[128px] aspect-square object-cover bg-muted shrink-0 border-r border-border/80"
        />
      )}
      <div className="min-w-0 flex flex-col justify-center gap-0.5 px-3 py-2 text-[13px]">
        <span className="text-muted-foreground truncate">{domain}</span>
        <span className="text-white truncate">{title}</span>
        {description && (
          <span className="text-muted-foreground line-clamp-2 leading-snug">{description}</span>
        )}
      </div>
    </a>
  );
}

/** The tweet an X quote tweet quotes, embedded like on X. The whole card
 *  opens the quoted tweet, so its text stays plain (no nested links). */
function ExternalQuoteCard({ quote }: { quote: ExternalQuote }) {
  return (
    <div className="mt-1 rounded-xl border border-border/80 overflow-hidden">
      {/* Author and text open the quoted tweet; the media below stays its
          own (a video plays in place), so it can't sit inside this link. */}
      <a
        href={quote.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block px-3 pt-2.5 pb-2 hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-1.5 min-w-0 text-[13px]">
          <UserAvatar address={quote.author.username} size={20} photoUrl={quote.author.avatar} />
          <span className="font-bold text-white truncate">{quote.author.name}</span>
          {quote.author.verified && (
            <BadgeCheck className="w-3.5 h-3.5 shrink-0 text-primary" aria-label="Verified on X" />
          )}
          <span className="text-muted-foreground truncate" suppressHydrationWarning>
            @{quote.author.username}
            {quote.createdAt && ` · ${formatTime(quote.createdAt)}`}
          </span>
        </div>
        {quote.text && (
          <div className="mt-1 text-[13.5px] leading-[1.45] text-white/90 whitespace-pre-wrap break-words line-clamp-6">
            {quote.text}
          </div>
        )}
      </a>
      {quote.media.length > 0 && (
        <div className="px-3 pb-3">
          <MediaGrid media={quote.media} singleMaxHeight={360} />
        </div>
      )}
    </div>
  );
}

/** X KOLs show their real name ("Elon Musk"), not the handle. */
function authorName(author: PostItem['author']): string {
  if (author.isVirtual && author.displayName) return author.displayName;
  return displayName(author);
}

function PostHeader({
  name,
  href,
  handle,
  tierRank,
  tier,
  createdAt,
  pending,
  fromX,
  kol,
  menu,
}: {
  name: string;
  /** The author's profile, when they have a public one. */
  href?: string;
  /** Shown as `@handle` beside the name, as on the author's trades. */
  handle?: string | null;
  tierRank: number | null;
  tier: string | null;
  createdAt: string;
  pending?: boolean;
  /** Mirrored from a tweet: badge the source. */
  fromX?: boolean;
  /** Author is an admin-added X KOL (virtual account), not a member. */
  kol?: boolean;
  /** Owner actions, pinned to the right of the header. */
  menu?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {href ? (
        <Link prefetch={false} href={href} className="text-[14px] font-bold text-white hover:underline">
          {name}
        </Link>
      ) : (
        <span className="text-[14px] font-bold text-white">{name}</span>
      )}
      {fromX && (
        <span
          title="Posted on X"
          className="inline-flex items-center gap-1 rounded-[3px] bg-accent/70 px-1.5 py-[1px] [font-family:var(--font-mono)] text-[9.5px] font-bold tracking-[0.06em] text-muted-foreground"
        >
          <XLogo className="w-2.5 h-2.5" />
          {kol && 'KOL'}
        </span>
      )}
      {tierRank !== null && (
        <span
          className={`[font-family:var(--font-mono)] text-[9.5px] font-bold px-1.5 py-[1px] rounded-[3px] tracking-[0.06em] ${
            tier === 'plat'
              ? 'bg-primary/14 text-primary'
              : tier === 'gold'
              ? 'bg-warning/14 text-warning'
              : 'bg-accent/70 text-muted-foreground'
          }`}
        >
          {(tier ?? '').toUpperCase()} #{tierRank}
        </span>
      )}
      {/* Relative to now: a server-rendered page says it as of then. */}
      <span className="text-[12px] text-muted-foreground" suppressHydrationWarning>
        {handle && <span data-testid="post-author-handle">@{handle} </span>}·{' '}
        {formatTime(createdAt)}
      </span>
      {pending && (
        <span
          data-testid="pending-marker"
          title="Will be sent when you're back online"
          className="inline-flex items-center gap-1 rounded-[3px] bg-accent/70 px-1.5 py-[1px] [font-family:var(--font-mono)] text-[9.5px] font-bold uppercase tracking-[0.06em] text-muted-foreground"
        >
          <Clock className="w-2.5 h-2.5" />
          Pending
        </span>
      )}
      {menu && <div className="ml-auto -my-1">{menu}</div>}
    </div>
  );
}

/** "⋯" on the viewer's own post: Delete, behind a confirm dialog. */
function PostMenu({ item, onDeleted }: { item: PostItem; onDeleted?: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const del = useDeletePost();
  const fromX = item.source === 'x';

  return (
    // The menu and dialog render in portals, but React still bubbles their
    // clicks up to the card, which would open the thread.
    <div onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Post options"
            className="touch-hit p-1 rounded-full text-muted-foreground hover:text-white hover:bg-muted transition-colors"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirming(true)}>
            <Trash2 />
            Delete post
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent className="sm:max-w-[420px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete post?</AlertDialogTitle>
            <AlertDialogDescription>
              {fromX
                ? "It's removed from Deor only — the tweet stays on X, and it won't come back on the next sync. This can't be undone."
                : "It's removed from your profile and the feed. This can't be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => del.mutate(item.id, { onSuccess: () => onDeleted?.() })}
              className="bg-danger/10 text-danger hover:bg-danger/20 border-none"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Very small relative-time helper (avoid pulling date-fns just for feed). */
function formatTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const diff = Math.max(0, Date.now() - t) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 30 * 86400) return `${Math.floor(diff / 86400)}d`;
  return new Date(t).toLocaleDateString();
}

/** Grid layout for 1..4 attachments — 1: contain-fit with hard max height,
 *  2: side-by-side square, 3: big-left + 2 stacked-right, 4: 2x2. */
function MediaGrid({
  media,
  singleMaxHeight = 510,
}: {
  media: PostMedia[];
  /** Height cap of a lone image/video, which keeps its own aspect ratio. */
  singleMaxHeight?: number;
}) {
  const items = media.slice(0, 4);
  if (items.length === 0) return null;

  if (items.length === 1) {
    return (
      <div className="mt-1">
        <SingleMedia media={items[0]} maxHeight={singleMaxHeight} />
      </div>
    );
  }

  const cols = 'grid-cols-2';
  const rows = items.length > 2 ? 'grid-rows-2' : '';

  return (
    <div
      className={`mt-1 grid gap-1 rounded-lg overflow-hidden max-h-[60vh] sm:max-h-[480px] ${cols} ${rows}`}
    >
      {items.map((m, i) => {
        const span = items.length === 3 && i === 0 ? 'row-span-2' : '';
        if (m.videoUrl) {
          return (
            <div key={m.url + i} className={`${span} relative bg-muted`}>
              <MediaVideo media={m} className="w-full h-full object-cover" />
            </div>
          );
        }
        return (
          <a
            key={m.url + i}
            href={m.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`${span} relative block bg-muted`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={m.url}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </a>
        );
      })}
    </div>
  );
}

/**
 * A lone image or video at its own aspect ratio, like X: as wide as the
 * column allows, but no taller than `maxHeight`, so a portrait shot gets
 * narrower instead of being cropped or letterboxed. Media without stored
 * dimensions falls back to its natural size within the same caps.
 */
function SingleMedia({ media, maxHeight }: { media: PostMedia; maxHeight: number }) {
  const { width, height } = media;
  const sized = !!width && !!height;
  const frameStyle = sized
    ? {
        aspectRatio: `${width} / ${height}`,
        width: `min(100%, ${Math.round((maxHeight * width) / height)}px)`,
      }
    : undefined;
  const frame = 'block rounded-xl overflow-hidden border border-border/80 bg-muted';

  if (media.videoUrl) {
    return (
      <div className={frame} style={frameStyle ?? { maxWidth: '100%' }}>
        <MediaVideo
          media={media}
          className={sized ? 'w-full h-full object-contain' : 'w-full h-auto'}
          style={sized ? undefined : { maxHeight }}
        />
      </div>
    );
  }
  return (
    <a
      href={media.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`${frame} ${sized ? '' : 'w-fit max-w-full'}`}
      style={frameStyle}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={media.url}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        className={sized ? 'w-full h-full object-cover' : 'max-w-full h-auto'}
        style={sized ? undefined : { maxHeight }}
      />
    </a>
  );
}

/** Video from a mirrored tweet: poster first, nothing downloaded until play. */
function MediaVideo({
  media,
  className,
  style,
}: {
  media: PostMedia;
  className: string;
  style?: CSSProperties;
}) {
  // pbs.twimg.com can refuse our Referer too, and a <video poster> can't drop
  // it, so the poster is a no-referrer <img> until the viewer hits play.
  const [started, setStarted] = useState(false);
  if (!started && media.url) {
    return (
      <button
        type="button"
        aria-label="Play video"
        onClick={() => setStarted(true)}
        className="group relative block w-full h-full"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={media.url}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          style={style}
          className={`bg-black ${className}`}
        />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="rounded-full bg-black/60 p-3 transition-colors group-hover:bg-black/80">
            <Play className="w-6 h-6 text-white fill-white" />
          </span>
        </span>
      </button>
    );
  }
  return (
    <video
      style={style}
      src={media.videoUrl ? playableVideoUrl(media.videoUrl) : undefined}
      controls
      playsInline
      autoPlay={started}
      preload={started ? 'auto' : 'none'}
      className={`bg-black ${className}`}
    />
  );
}

function PostActions({
  item,
  onOpenThread,
}: {
  item: PostItem;
  onOpenThread?: () => void;
}) {
  const { user } = useAuthStore();
  const setOpen = useAppShellStore((s) => s.setOpen);
  const likeMutation = useToggleLike();
  const repostMutation = useToggleRepost();
  const saveMutation = useToggleSave();
  const counts = item.counts ?? {};

  const requireAuth = (fn: () => void) => () => {
    if (!user) {
      setOpen('walletConnectOpen', true);
      return;
    }
    fn();
  };

  const toggleLike = requireAuth(() =>
    likeMutation.mutate({ postId: item.id, next: !item.viewerLiked }),
  );
  const toggleRepost = requireAuth(() =>
    repostMutation.mutate({ postId: item.id, next: !item.viewerReposted }),
  );
  const toggleSave = requireAuth(() =>
    saveMutation.mutate({ postId: item.id, next: !item.viewerSaved }),
  );

  return (
    <div className="flex items-center gap-5 mt-1.5 text-muted-foreground">
      <ActBtn
        icon={<MessageCircle className="w-3.5 h-3.5" />}
        label={counts.replies ?? 0}
        onClick={onOpenThread}
      />
      <ActBtn
        icon={<Repeat className="w-3.5 h-3.5" />}
        label={counts.reposts ?? 0}
        onClick={toggleRepost}
        active={item.viewerReposted}
        activeClassName="text-success"
      />
      <ActBtn
        icon={<Heart className="w-3.5 h-3.5" fill={item.viewerLiked ? 'currentColor' : 'none'} />}
        label={counts.likes ?? 0}
        onClick={toggleLike}
        active={item.viewerLiked}
        activeClassName="text-danger"
      />
      {item.externalUrl && (
        <a
          href={item.externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View on X"
          className="touch-hit ml-auto inline-flex items-center gap-1.5 px-2 py-1 rounded-full [font-family:var(--font-mono)] text-[12px] text-muted-foreground hover:text-white hover:bg-muted transition-colors"
        >
          View on
          <XLogo className="w-3 h-3" />
        </a>
      )}
      <button
        type="button"
        onClick={toggleSave}
        className={`touch-hit ${item.externalUrl ? '' : 'ml-auto '}inline-flex items-center gap-1.5 px-2 py-1 rounded-full [font-family:var(--font-mono)] text-[12px] transition-colors ${
          item.viewerSaved
            ? 'text-primary'
            : 'text-muted-foreground hover:text-white'
        } hover:bg-muted`}
        aria-label={item.viewerSaved ? 'Unsave' : 'Save'}
      >
        <Bookmark
          className="w-3.5 h-3.5"
          fill={item.viewerSaved ? 'currentColor' : 'none'}
        />
      </button>
    </div>
  );
}

function ActBtn({
  icon,
  label,
  className = '',
  onClick,
  active,
  activeClassName,
}: {
  icon: ReactNode;
  label: string | number;
  className?: string;
  onClick?: () => void;
  active?: boolean;
  activeClassName?: string;
}) {
  const activeStyle = active && activeClassName ? activeClassName : '';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`touch-hit inline-flex items-center gap-1.5 px-2 py-1 rounded-full [font-family:var(--font-mono)] text-[12px] hover:bg-muted transition-colors ${
        active ? '' : 'text-muted-foreground hover:text-white'
      } ${activeStyle} ${className}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

