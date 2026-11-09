/**
 * Unified feed-item union — every feed source (user posts, PAMM/Perps/Spot
 * trades, news takes) normalizes into one of these variants so the same
 * `<FeedPost>` renderer can switch on `kind` without per-source components.
 *
 * All variants share `FeedItemBase` (id/createdAt/author). Phase 01 only
 * exposes/renders the `post` variant; the trade + take variants ship in
 * their own phases (03–06).
 */

export interface FeedAuthor {
  id: string;
  /** Chosen nickname. May be empty — UI must fall back to short wallet/email. */
  username?: string | null;
  email?: string | null;
  solanaWallet?: string | null;
  walletAddress?: string | null;
  avatar?: string | null;
  tier?: string | null;
  tierRank?: number | null;
  /** Public profile handle (`/u/@handle`) — X KOLs have one too; null without one. */
  handle?: string | null;
  /** Account mirrored from X (a KOL); the next two fields come with it. */
  isVirtual?: boolean;
  displayName?: string | null;
  xUsername?: string | null;
}

export interface PostMedia {
  url: string;
  width?: number;
  height?: number;
  mime: string;
  /** Playable mp4 when the item is a video; `url` is then its poster. */
  videoUrl?: string | null;
}

/** Snapshot of the tweet a mirrored X post quotes, shown as an embedded card. */
export interface ExternalQuote {
  id: string;
  url: string;
  text: string;
  createdAt: string | null;
  author: {
    name: string;
    username: string;
    avatar: string | null;
    verified?: boolean;
  };
  media: PostMedia[];
}

/** Preview card for the link a post shares. */
export interface LinkPreview {
  url: string;
  title: string;
  description: string | null;
  domain: string;
  image: { url: string; width?: number | null; height?: number | null } | null;
  /** Wide image above the text; otherwise a small thumbnail beside it. */
  large: boolean;
}

export interface MarketSummary {
  id: string;
  question: string;
  yesPct?: number;
  noPct?: number;
}

export interface PostCounts {
  replies?: number;
  reposts?: number;
  likes?: number;
  zaps?: number;
  zapUsd?: number;
}

export interface QuotedPost {
  id: string;
  content: string;
  author: FeedAuthor;
  media?: PostMedia[];
}

interface FeedItemBase {
  id: string;
  createdAt: string;
  author: FeedAuthor;
}

export type FeedItem =
  | (FeedItemBase & {
      kind: 'post';
      content: string;
      /** Network the post was mirrored from (`'x'`); absent on native posts. */
      source?: string | null;
      /** Link to the original (the tweet), shown as "View on X". */
      externalUrl?: string | null;
      /** The tweet a mirrored X quote tweet quotes. */
      externalQuote?: ExternalQuote | null;
      linkPreview?: LinkPreview | null;
      market?: MarketSummary | null;
      media?: PostMedia[];
      parentPostId?: string | null;
      quotedPost?: QuotedPost | null;
      counts?: PostCounts;
      viewerLiked?: boolean;
      viewerReposted?: boolean;
      viewerSaved?: boolean;
      /** Set when this feed row is a silent-repost surfaced in the feed. The
       *  author + content still belong to the original post; this field
       *  identifies who reposted it. */
      repostedBy?: FeedAuthor | null;
      /** The row's time in the list it came from (the repost's time on a
       *  repost row); what the server orders by. Absent on optimistic rows. */
      feedAt?: string;
    })
  | (FeedItemBase & {
      kind: 'trade-pamm';
      marketId: string;
      question: string;
      side: 'YES' | 'NO';
      shares: number;
      avgPrice: number;
      usdAmount: number;
    })
  | (FeedItemBase & {
      kind: 'trade-perps';
      symbol: string;
      side: 'LONG' | 'SHORT';
      leverage: number;
      entryPrice: number;
      size: number;
      pnl?: number;
    })
  | (FeedItemBase & {
      kind: 'trade-spot';
      inSymbol: string;
      outSymbol: string;
      inAmount: number;
      outAmount: number;
      usdValue: number;
    })
  | (FeedItemBase & {
      kind: 'take';
      title: string;
      excerpt: string;
      coverUrl?: string | null;
      topic?: string | null;
      slug: string;
    });

export interface Paginated<T> {
  items: T[];
  nextCursor?: string | null;
  /** Sample posts, shown when the real feed is not available. */
  sample?: boolean;
}
