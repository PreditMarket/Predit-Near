/** A feed item: a post from X, or from the sample feed. */

export interface FeedAuthor {
  id: string;
  username?: string | null;
  avatar?: string | null;
  /** X handle; the author's record lives at `/u/@handle`. */
  handle?: string | null;
  /** The real name X shows ("Elon Musk"). */
  displayName?: string | null;
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

interface FeedItemBase {
  id: string;
  createdAt: string;
  author: FeedAuthor;
}

export type FeedItem =
  | (FeedItemBase & {
      kind: 'post';
      content: string;
      /** Where the post came from: `'x'` or `'sample'`. */
      source?: string | null;
      /** Link to the original (the tweet), shown as "View on X". */
      externalUrl?: string | null;
      /** The tweet a mirrored X quote tweet quotes. */
      externalQuote?: ExternalQuote | null;
      linkPreview?: LinkPreview | null;
      media?: PostMedia[];
    });

export interface Paginated<T> {
  items: T[];
  nextCursor?: string | null;
  /** Sample posts, shown when the real feed is not available. */
  sample?: boolean;
}
