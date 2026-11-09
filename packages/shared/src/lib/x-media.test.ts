import { afterEach, describe, expect, it, vi } from 'vitest';
import { playableVideoUrl } from './x-media';

describe('playableVideoUrl', () => {
  afterEach(() => vi.unstubAllEnvs());

  it("routes tweet videos through this app's proxy route", () => {
    const src = 'https://video.twimg.com/amplify_video/1/vid/avc1/1280x720/a.mp4?tag=29';
    expect(playableVideoUrl(src)).toBe(
      `/api/x-media/video?url=${encodeURIComponent(src)}`,
    );
  });

  it('also proxies the newer video-s.twimg.com host', () => {
    const src = 'https://video-s.twimg.com/amplify_video/2/vid/avc1/1286x720/b.mp4?tag=29';
    expect(playableVideoUrl(src)).toBe(
      `/api/x-media/video?url=${encodeURIComponent(src)}`,
    );
  });

  it('uses the Cloudflare Worker when one is configured', () => {
    vi.stubEnv('NEXT_PUBLIC_X_VIDEO_PROXY_URL', 'https://media.predit.market/');
    const src = 'https://video.twimg.com/amplify_video/1/vid/avc1/1280x720/a.mp4?tag=29';
    expect(playableVideoUrl(src)).toBe(
      `https://media.predit.market/?url=${encodeURIComponent(src)}`,
    );
  });

  it('leaves other URLs alone', () => {
    expect(playableVideoUrl('https://cdn.example.com/a.mp4')).toBe(
      'https://cdn.example.com/a.mp4',
    );
    expect(playableVideoUrl('not a url')).toBe('not a url');
  });
});
