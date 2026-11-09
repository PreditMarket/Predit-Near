import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

// The only hosts this will fetch, so it cannot be pointed anywhere else.
const ALLOWED_HOSTS = new Set(['video.twimg.com', 'video-s.twimg.com']);
const PASS_BACK = ['content-type', 'content-length', 'content-range', 'accept-ranges'];

/** Streams tweet videos: X refuses requests whose Referer is another site. */
export async function GET(req: NextRequest) {
  let url: URL;
  try {
    url = new URL(req.nextUrl.searchParams.get('url') ?? '');
  } catch {
    return new Response('Bad url', { status: 400 });
  }
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) {
    return new Response('Host not allowed', { status: 400 });
  }

  const range = req.headers.get('range');
  const upstream = await fetch(url, {
    headers: range ? { Range: range } : {},
    redirect: 'error',
    cache: 'no-store',
  });
  if (!upstream.ok || !upstream.body) return new Response('Upstream failed', { status: 502 });

  const headers = new Headers({ 'cache-control': 'public, max-age=86400' });
  for (const name of PASS_BACK) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}
