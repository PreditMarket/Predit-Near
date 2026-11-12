import type {
  ExternalQuote,
  FeedAuthor,
  FeedItem,
  LinkPreview,
  PostMedia,
  Paginated,
} from '../types/feed';

/** A post as `/api/feed` returns it. */
export interface PostDto {
  id: string;
  content: string;
  createdAt: string;
  author: FeedAuthor;
  media?: PostMedia[];
  source?: string | null;
  externalUrl?: string | null;
  externalQuote?: ExternalQuote | null;
  linkPreview?: LinkPreview | null;
}

/** A `/api/feed` post as the FeedItem union <FeedPost> renders. */
export function postDtoToFeedItem(p: PostDto): Extract<FeedItem, { kind: 'post' }> {
  return {
    kind: 'post',
    id: p.id,
    createdAt: p.createdAt,
    author: p.author,
    content: p.content,
    media: p.media ?? [],
    source: p.source ?? null,
    externalUrl: p.externalUrl ?? null,
    externalQuote: p.externalQuote ?? null,
    linkPreview: p.linkPreview ?? null,
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
