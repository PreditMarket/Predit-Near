import { NextResponse, type NextRequest } from 'next/server';
import { samplePosts } from '@/lib/feed/fixture';
import { isOriginalTweet, tweetToPost, type RawTweet } from '@/lib/feed/tweet-to-post';
import type { PostDto } from '@/services/feed.service';

export const dynamic = 'force-dynamic';

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
const API_BASE = () => process.env.TWITTER_API_BASE_URL?.trim() || 'https://api.twitterapi.io';
const CACHE_SEC = 300;
const MAX_LIMIT = 50;

const handles = () =>
  (process.env.FEED_HANDLES ?? '')
    .split(',')
    .map((h) => h.trim().replace(/^@/, ''))
    .filter(Boolean);

/** One account's latest tweets. A failure leaves that account out, not the feed. */
async function latestPosts(handle: string, key: string): Promise<PostDto[]> {
  try {
    const res = await fetch(
      `${API_BASE()}/twitter/user/last_tweets?userName=${encodeURIComponent(handle)}`,
      { headers: { 'X-API-Key': key }, next: { revalidate: CACHE_SEC } },
    );
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: { tweets?: RawTweet[] }; tweets?: RawTweet[] };
    return (body.data?.tweets ?? body.tweets ?? [])
      .filter(isOriginalTweet)
      .flatMap((tweet) => tweetToPost(tweet, tweet.author?.userName ?? handle) ?? []);
  } catch {
    return [];
  }
}

async function allPosts(): Promise<{ posts: PostDto[]; sample: boolean }> {
  const key = process.env.TWITTER_API_KEY?.trim();
  if (!key) return { posts: samplePosts(), sample: true };

  const list = handles();
  const batches = await Promise.all((list.length ? list : DEFAULT_HANDLES).map((h) => latestPosts(h, key)));
  const posts = batches.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return posts.length ? { posts, sample: false } : { posts: samplePosts(), sample: true };
}

/** Posts newest first; the cursor is an offset into the merged list. */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const start = Math.max(Number(params.get('cursor')) || 0, 0);
  const limit = Math.min(Math.max(Number(params.get('limit')) || 20, 1), MAX_LIMIT);
  const { posts, sample } = await allPosts();
  const end = start + limit;
  return NextResponse.json({
    items: posts.slice(start, end),
    nextCursor: end < posts.length ? String(end) : null,
    sample,
  });
}
