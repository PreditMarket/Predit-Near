import { NextResponse, type NextRequest } from 'next/server';
import { detectPrediction } from '@/lib/ai/post-ai';
import { nearAiKey } from '@/lib/ai/near-ai';
import { loadPosts } from '@/lib/feed/posts';
import type { PostDto } from '@/services/feed.service';

export const dynamic = 'force-dynamic';
export const maxDuration = 160;

const MAX_IDS = 50;
const WORKERS = 4;

/**
 * Which feed posts make a checkable prediction: `{ detected: { [postId]: claim } }`.
 * Takes post ids, never text, so this can't be used as a free model endpoint.
 */
export async function GET(req: NextRequest) {
  const ids = new Set((req.nextUrl.searchParams.get('ids') ?? '').split(',').filter(Boolean).slice(0, MAX_IDS));
  if (!ids.size || !nearAiKey()) return NextResponse.json({ detected: {} });

  const queue: PostDto[] = (await loadPosts()).posts.filter((post) => ids.has(post.id));
  const detected: Record<string, string> = {};
  const worker = async () => {
    for (let post = queue.shift(); post; post = queue.shift()) {
      try {
        const { detected: isPrediction, claim } = await detectPrediction(post);
        if (isPrediction) detected[post.id] = claim;
      } catch (err) {
        console.error('NEAR AI detect failed:', (err as Error).message);
      }
    }
  };
  await Promise.all(Array.from({ length: WORKERS }, worker));
  return NextResponse.json({ detected });
}
