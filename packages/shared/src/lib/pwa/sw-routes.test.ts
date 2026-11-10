import { describe, expect, it } from 'vitest';
import { classifyRequest, originsOf, pageCacheKey, type SwRequest, type SwRouteConfig } from './sw-routes';

const config: SwRouteConfig = {
  appOrigin: 'https://predit.market',
  rpcOrigins: ['https://test.rpc.fastnear.com'],
};

const req = (url: string, o: Partial<Omit<SwRequest, 'url'>> = {}): SwRequest => ({
  url: new URL(url),
  method: 'GET',
  mode: 'cors',
  destination: '',
  accept: null,
  ...o,
});

const kind = (url: string, o?: Partial<Omit<SwRequest, 'url'>>) => classifyRequest(req(url, o), config);

describe('classifyRequest', () => {
  it('never caches this site\'s own API: prices and balances must be live', () => {
    expect(kind('https://predit.market/api/feed?limit=20')).toBeNull();
    expect(kind('https://predit.market/api/evidence/12')).toBeNull();
    expect(kind('https://predit.market/api/admin/pending', { mode: 'navigate' })).toBeNull();
  });

  it('never caches writes', () => {
    expect(kind('https://predit.market/api/admin/confirm', { method: 'POST' })).toBe('network-only');
    expect(kind('https://predit.market/', { method: 'POST', mode: 'navigate' })).toBe('network-only');
  });

  it('leaves event streams, NEAR RPC and sockets to the network', () => {
    expect(kind('https://predit.market/stream', { accept: 'text/event-stream' })).toBe('network-only');
    expect(kind('https://test.rpc.fastnear.com/')).toBe('network-only');
    expect(kind('wss://example.com/socket')).toBe('network-only');
  });

  it('serves page loads network-first', () => {
    expect(kind('https://predit.market/markets', { mode: 'navigate', destination: 'document' })).toBe('navigation');
    // Another site's page is never ours to cache.
    expect(kind('https://x.com/preditmarket', { mode: 'navigate' })).toBeNull();
  });

  it('caches build output and media cache-first', () => {
    expect(kind('https://predit.market/_next/static/chunks/main-abc123.js')).toBe('next-static');
    expect(kind('https://predit.market/_next/static/css/app.css')).toBe('next-static');
    expect(kind('https://predit.market/_next/static/media/logo.5f3c.svg')).toBe('media');
    expect(kind('https://predit.market/_next/image?url=%2Fx.png&w=64&q=75')).toBe('media');
    expect(kind('https://predit.market/icons/icon-192.png')).toBe('media');
    expect(kind('https://predit.market/avatars/a', { destination: 'image' })).toBe('media');
  });

  it("leaves other sites' images and fonts to the browser", () => {
    expect(kind('https://pbs.twimg.com/media/x.jpg', { destination: 'image' })).toBeNull();
    expect(kind('https://fonts.gstatic.com/s/inter.woff2', { destination: 'font' })).toBeNull();
  });

  it('ignores everything else', () => {
    expect(kind('https://api.twitterapi.io/twitter/user/last_tweets')).toBeNull();
    expect(kind('https://predit.market/markets?_rsc=1x2y')).toBeNull();
  });
});

describe('pageCacheKey', () => {
  it('saves a page under its path alone', () => {
    expect(pageCacheKey('https://predit.market/?source=pwa')).toBe('https://predit.market/');
    expect(pageCacheKey('https://predit.market/markets?category=crypto#top')).toBe('https://predit.market/markets');
    expect(pageCacheKey(new URL('https://predit.market/u/@alice'))).toBe('https://predit.market/u/@alice');
  });
});

describe('originsOf', () => {
  it('dedupes origins and skips blanks and junk', () => {
    expect(
      originsOf(['https://a.example/x', 'https://a.example/y', undefined, '', 'not a url', ' https://b.example/z ']),
    ).toEqual(['https://a.example', 'https://b.example']);
  });
});
