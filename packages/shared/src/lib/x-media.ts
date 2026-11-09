// X serves tweet videos from both; both refuse another site's Referer.
const X_VIDEO_HOSTS = new Set(['video.twimg.com', 'video-s.twimg.com']);

/**
 * Where a <video> should load a tweet video from. X's video hosts refuse
 * requests whose Referer is another site, and every browser sends ours, so
 * those go through a proxy: the Cloudflare Worker at
 * NEXT_PUBLIC_X_VIDEO_PROXY_URL when set (keeps video traffic off the API),
 * else this app's own route (`/api/x-media/video`). Other URLs are returned as they are.
 */
export function playableVideoUrl(url: string): string {
  try {
    if (!X_VIDEO_HOSTS.has(new URL(url).hostname)) return url;
  } catch {
    return url;
  }
  const encoded = encodeURIComponent(url);
  const worker = process.env.NEXT_PUBLIC_X_VIDEO_PROXY_URL?.trim().replace(/\/+$/, '');
  return worker
    ? `${worker}/?url=${encoded}`
    : `/api/x-media/video?url=${encoded}`;
}
