import apiClient from '@/lib/axios';
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
  async listPosts(params: {
    cursor?: string | null;
    limit?: number;
    authorIds?: string[];
    marketIds?: string[];
    parentId?: string | 'null';
    saved?: boolean;
    following?: boolean;
  } = {}): Promise<Paginated<PostDto>> {
    const q: Record<string, string> = {};
    if (params.cursor) q.cursor = params.cursor;
    if (params.limit) q.limit = String(params.limit);
    if (params.authorIds?.length) q.authorIds = params.authorIds.join(',');
    if (params.marketIds?.length) q.marketIds = params.marketIds.join(',');
    if (params.parentId !== undefined) q.parentId = params.parentId;
    if (params.saved) q.saved = 'true';
    if (params.following) q.following = 'true';
    const { data } = await apiClient.get<ListResponse>('/posts', { params: q });
    return { items: data.items, nextCursor: data.nextCursor ?? null };
  },

  async createPost(body: {
    content: string;
    marketId?: string;
    parentPostId?: string;
    quotedPostId?: string;
    media?: PostMedia[];
  }, options: { idempotencyKey?: string } = {}): Promise<PostDto> {
    // BE answers a repeated key with the post it already created (201), and
    // 409 while the first request with that key is still being handled.
    const { data } = await apiClient.post<PostDto>('/posts', body, {
      headers: options.idempotencyKey
        ? { 'Idempotency-Key': options.idempotencyKey }
        : undefined,
    });
    return data;
  },

  async deletePost(id: string): Promise<void> {
    await apiClient.delete(`/posts/${id}`);
  },

  async likePost(id: string): Promise<PostDto> {
    const { data } = await apiClient.post<PostDto>(`/posts/${id}/like`);
    return data;
  },

  async unlikePost(id: string): Promise<PostDto> {
    const { data } = await apiClient.delete<PostDto>(`/posts/${id}/like`);
    return data;
  },

  async repostPost(id: string): Promise<PostDto> {
    const { data } = await apiClient.post<PostDto>(`/posts/${id}/repost`);
    return data;
  },

  async unrepostPost(id: string): Promise<PostDto> {
    const { data } = await apiClient.delete<PostDto>(`/posts/${id}/repost`);
    return data;
  },

  async savePost(id: string): Promise<PostDto> {
    const { data } = await apiClient.post<PostDto>(`/posts/${id}/save`);
    return data;
  },

  async unsavePost(id: string): Promise<PostDto> {
    const { data } = await apiClient.delete<PostDto>(`/posts/${id}/save`);
    return data;
  },
};
