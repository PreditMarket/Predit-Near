// The home feed's posts query key. Apart from use-posts-feed (a client
// module) so the home's server page can prefetch under the same key.

export const POSTS_FEED_QUERY_KEY = ['home-feed', 'posts'] as const;

export interface PostsFeedFilters {
  authorIds?: string[];
  marketIds?: string[];
  parentId?: string | 'null';
  limit?: number;
  /** Bookmarks tab — restricts results to posts the viewer has saved. */
  saved?: boolean;
  /** For you tab — the viewer's id: only their posts and those of the users
   *  they follow (posts and reposts). The server reads the viewer from the
   *  token; the id keys the cache per account. Not fetched while null. */
  following?: string | null;
  /** False keeps the query idle (e.g. a tab that isn't open). Default true. */
  enabled?: boolean;
}

export function postsFeedKey(filters: PostsFeedFilters = {}) {
  return [
    ...POSTS_FEED_QUERY_KEY,
    filters.authorIds?.slice().sort().join(',') ?? '',
    filters.marketIds?.slice().sort().join(',') ?? '',
    filters.parentId ?? '',
    filters.saved ? 'saved' : '',
    filters.following !== undefined ? `following:${filters.following}` : '',
    filters.limit ?? 20,
  ] as const;
}
