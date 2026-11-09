import { NextResponse, type NextRequest } from 'next/server';
import { draftMarket } from '@/lib/ai/post-ai';
import { nearAiKey } from '@/lib/ai/near-ai';
import { findPost } from '@/lib/feed/posts';

export const dynamic = 'force-dynamic';
/** The model reasons for 30 to 60 seconds, and a failed call is retried once. */
export const maxDuration = 160;

/** NEAR AI's draft of a market for one feed post. Takes an id, never text. */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('post');
  if (!id) return NextResponse.json({ error: 'Missing post' }, { status: 400 });
  if (!nearAiKey()) return NextResponse.json({ error: 'NEAR AI is not configured' }, { status: 503 });

  const post = await findPost(id);
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    return NextResponse.json(await draftMarket(post));
  } catch (err) {
    console.error('NEAR AI draft failed:', (err as Error).message);
    return NextResponse.json({ error: 'NEAR AI could not draft this post' }, { status: 502 });
  }
}
