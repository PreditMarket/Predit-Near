import { NextResponse, type NextRequest } from 'next/server';
import { findPost, loadPosts } from '@/lib/feed/posts';

export const dynamic = 'force-dynamic';

const MAX_LIMIT = 50;

/** Posts newest first; the cursor is an offset into the merged list. */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const id = params.get('id');
  if (id) {
    const post = await findPost(id);
    return post ? NextResponse.json({ post }) : NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const start = Math.max(Number(params.get('cursor')) || 0, 0);
  const limit = Math.min(Math.max(Number(params.get('limit')) || 20, 1), MAX_LIMIT);
  const { posts, sample } = await loadPosts();
  const end = start + limit;
  return NextResponse.json({
    items: posts.slice(start, end),
    nextCursor: end < posts.length ? String(end) : null,
    sample,
  });
}
