import { describe, expect, it } from 'vitest';
import { classifyRequest, originsOf, pageCacheKey, type SwRequest, type SwRouteConfig } from './sw-routes';

const config: SwRouteConfig = {
  appOrigin: 'https://predit.market',
  apiOrigins: ['https://api.predit.market'],
  rpcOrigins: ['https://rpc.example.com'],
};

const req = (url: string, o: Partial<Omit<SwRequest, 'url'>> = {}): SwRequest => ({
  url: new URL(url),
  method: 'GET',
  mode: 'cors',
  destination: '',
  authorized: false,
  accept: null,
  ...o,
});

const kind = (url: string, o?: Partial<Omit<SwRequest, 'url'>>) =>
  classifyRequest(req(url, o), config);

describe('classifyRequest', () => {
  it('caches public API reads network-first', () => {
    for (const path of [
      '/api/v2/social/leaders?window=30d',
      '/api/v2/social/profile/alice',
      '/api/v2/social/feed/all',
      '/api/v1/posts',
      '/api/v1/posts?parentId=p1',
      '/api/v1/categories',
      '/api/v1/topics',
      '/api/v1/stats/public',
      '/api/v1/xp-events/leaderboard?type=weekly',
      '/api/v2/push/config',
    ]) {
      expect(kind(`https://api.predit.market${path}`), path).toBe('public-api');
    }
  });

  it('never caches a request that carries Authorization', () => {
    expect(kind('https://api.predit.market/api/v2/social/leaders', { authorized: true })).toBe(
      'network-only',
    );
    expect(kind('https://api.predit.market/api/v2/auth/me', { authorized: true })).toBe(
      'network-only',
    );
  });

  it('never caches writes', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(kind('https://api.predit.market/api/v1/posts', { method })).toBe('network-only');
    }
    expect(kind('https://predit.market/', { method: 'POST', mode: 'navigate' })).toBe(
      'network-only',
    );
  });

  it('never caches prices and market data', () => {
    for (const path of [
      '/api/v1/phoenix-perps/markets',
      '/api/v1/phoenix-perps/markets/SOL/orderbook',
      '/api/v1/perps/positions',
      '/api/v1/lighter-perps/markets/1/candles',
      '/api/v1/polymarket/markets',
      '/api/v2/spot/route',
      '/api/v1/pamm-markets/abc/stream',
      '/api/v1/anything/price',
    ]) {
      expect(kind(`https://api.predit.market${path}`)).toBe('network-only');
    }
  });

  it('never caches odds, prediction-market prices or balances', () => {
    for (const path of [
      // PAMM: list + detail carry yes/no prices and pool reserves.
      '/api/v1/pamm-markets',
      '/api/v1/pamm-markets?status=active&limit=20',
      '/api/v1/pamm-markets/abc',
      '/api/v1/pamm-markets/abc/realtime',
      '/api/v1/pamm-markets/abc/trades',
      '/api/v1/pamm-markets/global-pause',
      '/api/v1/pamm/collaterals',
      '/api/v1/pamm-kol/markets',
      // Imported venues.
      '/api/v1/polymarket/markets',
      '/api/v1/polymarket/markets/123',
      '/api/v1/kalshi/markets/KXBTC',
      '/api/v1/dflow/markets',
      '/api/v1/dflow/markets/KXFED-25DEC',
      '/api/v1/quick-markets/active',
      '/api/v1/quick-markets/tokens',
      '/api/v1/oracles',
      '/api/v1/oracles/o1',
      // V1 markets and groups (members joined with their yesPrice).
      '/api/v1/market',
      '/api/v1/market/m1',
      '/api/v1/markets/m1/odds',
      '/api/v1/market-groups',
      '/api/v1/market-groups/us-election',
      // The account's money.
      '/api/v2/balances',
      '/api/v2/pnl',
      '/api/v1/anything/positions',
      '/api/v1/anything/balance',
      '/api/v1/kalshi/markets/abc/candles',
    ]) {
      expect(kind(`https://api.predit.market${path}`), path).toBe('network-only');
    }
  });

  it('leaves event streams, RPC and sockets to the network', () => {
    expect(
      kind('https://api.predit.market/api/v1/posts', { accept: 'text/event-stream' }),
    ).toBe('network-only');
    expect(kind('https://rpc.example.com/')).toBe('network-only');
    expect(kind('https://api.mainnet-beta.solana.com/')).toBe('network-only');
    expect(kind('https://mainnet.helius-rpc.com/?api-key=x')).toBe('network-only');
    expect(kind('wss://ws.phoenix.trade/')).toBe('network-only');
  });

  it('matches the configured API origin only', () => {
    // Same path on a host that is not the API: not the SW's business.
    expect(kind('https://evil.example/api/v2/social/leaders')).toBeNull();
    expect(
      classifyRequest(req('https://intl-api.predit.market/api/v1/posts'), {
        ...config,
        apiOrigins: originsOf(['https://intl-api.predit.market/api/v1']),
      }),
    ).toBe('public-api');
  });

  it('serves page loads network-first', () => {
    expect(kind('https://predit.market/leaders', { mode: 'navigate', destination: 'document' })).toBe(
      'navigation',
    );
    // Route handlers are not pages.
    expect(kind('https://predit.market/api/market-import/thumbnail', { mode: 'navigate' })).toBeNull();
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
    // Proxied, an opaque cross-origin <img> can't be cached anyway, and a
    // hanging IPFS gateway kept the home's load event from ever firing.
    expect(kind('https://assets.coingecko.com/coins/images/1/small/bitcoin.png', { destination: 'image' })).toBeNull();
    expect(kind('https://ipfs.filebase.io/ipfs/bafkrei', { destination: 'image' })).toBeNull();
    expect(kind('https://pbs.twimg.com/media/x.jpg', { destination: 'image' })).toBeNull();
    expect(kind('https://fonts.gstatic.com/s/inter.woff2', { destination: 'font' })).toBeNull();
  });

  it('ignores everything else', () => {
    expect(kind('https://api.binance.com/api/v3/ticker/24hr')).toBeNull();
    expect(kind('https://predit.market/leaders?_rsc=1x2y')).toBeNull();
  });
});

describe('pageCacheKey', () => {
  it('saves a page under its path alone', () => {
    expect(pageCacheKey('https://predit.market/?source=pwa')).toBe('https://predit.market/');
    expect(pageCacheKey('https://predit.market/leaders?window=7d#top')).toBe(
      'https://predit.market/leaders',
    );
    expect(pageCacheKey(new URL('https://predit.market/u/@alice'))).toBe('https://predit.market/u/@alice');
  });
});

describe('originsOf', () => {
  it('dedupes origins and skips blanks and junk', () => {
    expect(
      originsOf([
        'https://api.predit.market/api/v1',
        'https://api.predit.market/api/v2',
        undefined,
        '',
        'not a url',
        ' https://intl-api.predit.market/api/v1 ',
      ]),
    ).toEqual(['https://api.predit.market', 'https://intl-api.predit.market']);
  });
});
