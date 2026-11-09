import type {
  ExternalQuote,
  FeedAuthor,
  FeedItem,
  LinkPreview,
  PostMedia,
  Paginated,
  QuotedPost,
  PostCounts,
} from '../types/feed';

/**
 * Post API surface — Phase 01 of the home-feeds initiative. Only text
 * posts + list + create + delete-own. Later phases add media (P02),
 * engagement fields (P08+), zaps (P10). Response shape includes fields
 * for those future phases but they may be null/absent until wired.
 */

export interface PostDto {
  id: string;
  content: string;
  createdAt: string;
  author: FeedAuthor;
  market?: {
    id: string;
    question: string;
    yesPct?: number;
    noPct?: number;
  } | null;
  media?: PostMedia[];
  source?: string | null;
  externalUrl?: string | null;
  externalQuote?: ExternalQuote | null;
  linkPreview?: LinkPreview | null;
  parentPostId?: string | null;
  quotedPost?: QuotedPost | null;
  counts?: PostCounts;
  viewerLiked?: boolean;
  viewerReposted?: boolean;
  viewerSaved?: boolean;
  repostedBy?: FeedAuthor | null;
  feedAt?: string;
}

interface ListResponse {
  items: PostDto[];
  nextCursor?: string | null;
}

/** Map raw BE dto to the FeedItem union expected by <FeedPost>. */
export function postDtoToFeedItem(p: PostDto): Extract<FeedItem, { kind: 'post' }> {
  return {
    kind: 'post',
    id: p.id,
    createdAt: p.createdAt,
    author: p.author,
    content: p.content,
    market: p.market ?? null,
    media: p.media ?? [],
    source: p.source ?? null,
    externalUrl: p.externalUrl ?? null,
    externalQuote: p.externalQuote ?? null,
    linkPreview: p.linkPreview ?? null,
    parentPostId: p.parentPostId ?? null,
    quotedPost: p.quotedPost ?? null,
    counts: p.counts,
    viewerLiked: p.viewerLiked,
    viewerReposted: p.viewerReposted,
    viewerSaved: p.viewerSaved,
    repostedBy: p.repostedBy ?? null,
    feedAt: p.feedAt,
  };
}

export const feedService = {
  async listPosts(params: { cursor?: string | null; limit?: number } = {}): Promise<Paginated<PostDto>> {
    const q = new URLSearchParams();
    if (params.cursor) q.set('cursor', params.cursor);
    if (params.limit) q.set('limit', String(params.limit));
    const res = await fetch(`/api/feed?${q.toString()}`);
    if (!res.ok) throw new Error('Could not load the feed');
    return (await res.json()) as Paginated<PostDto>;
  },
};
