import { unstable_cache } from 'next/cache';
import type { PostDto } from '@/services/feed.service';
import { samplePosts } from './fixture';
import { isOriginalTweet, tweetToPost, type RawTweet } from './tweet-to-post';

const DEFAULT_HANDLES = [
  'VitalikButerin',
  'NEARProtocol',
  'ilblackdragon',
  'cz_binance',
  'elonmusk',
  'balajis',
  'APompliano',
  'CryptoHayes',
];
const CACHE_SEC = 300;

const apiBase = () => process.env.TWITTER_API_BASE_URL?.trim() || 'https://api.twitterapi.io';

const handles = () => {
  const list = (process.env.FEED_HANDLES ?? '')
    .split(',')
    .map((h) => h.trim().replace(/^@/, ''))
    .filter(Boolean);
  return list.length ? list : DEFAULT_HANDLES;
};

/** One account's latest tweets. A failure leaves that account out, not the feed. */
async function latestPosts(base: string, handle: string, key: string): Promise<PostDto[]> {
  try {
    const res = await fetch(`${base}/twitter/user/last_tweets?userName=${encodeURIComponent(handle)}`, {
      headers: { 'X-API-Key': key },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: { tweets?: RawTweet[] }; tweets?: RawTweet[] };
    return (body.data?.tweets ?? body.tweets ?? [])
      .filter(isOriginalTweet)
      .flatMap((tweet) => tweetToPost(tweet, tweet.author?.userName ?? handle) ?? []);
  } catch {
    return [];
  }
}

/** Throws on an empty result, so an outage is not remembered for five minutes. */
const livePosts = unstable_cache(
  async (base: string, list: string[]): Promise<PostDto[]> => {
    const key = process.env.TWITTER_API_KEY?.trim() ?? '';
    const batches = await Promise.all(list.map((handle) => latestPosts(base, handle, key)));
    const posts = batches.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (!posts.length) throw new Error('The X feed returned nothing');
    return posts;
  },
  ['feed-posts-v1'],
  { revalidate: CACHE_SEC },
);

export async function loadPosts(): Promise<{ posts: PostDto[]; sample: boolean }> {
  if (!process.env.TWITTER_API_KEY?.trim()) return { posts: samplePosts(), sample: true };
  try {
    return { posts: await livePosts(apiBase(), handles()), sample: false };
  } catch {
    return { posts: samplePosts(), sample: true };
  }
}

export async function findPost(id: string): Promise<PostDto | null> {
  return (await loadPosts()).posts.find((p) => p.id === id) ?? null;
}
