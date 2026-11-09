import type { Metadata } from 'next';
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import PredictionsPageV2 from '@/components/predictions-page-v2';
import { buildMetadata } from '@/lib/metadata/build-metadata';
import { fetchMarketList } from '@/lib/metadata/market-metadata';
import { SITE_URL } from '@/lib/site-url';
import { OFFCHAIN_MARKETS_ENABLED } from '@/lib/feature-flags';
import type { Market } from '@/services/market.service';
import {
  serverListPammMarkets,
  serverPammHighlight,
} from '@/lib/pamm/server-pamm-markets';
import { DEFAULT_PAMM_MARKET_LIST } from '@/lib/pamm/default-market-list';
import {
  getTrendingSectionMarkets,
  TRENDING_SECTION_KEY,
} from '@/lib/pamm/trending-section';
import { HIGHLIGHT_SECTION_KEY } from '@/lib/pamm/highlight-section';

// Prices and status come live from the contract.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildMetadata({
  title: 'Prediction Markets — Predit',
  description:
    'Browse live prediction markets on Predit. Trade on crypto, sports, politics, tech, and culture with insights from expert AI oracles.',
  path: '/markets',
  ogType: 'website',
  keywords: [
    'prediction markets',
    'predit',
    'crypto prediction market',
    'sports prediction market',
    'politics prediction market',
    'AI oracle predictions',
  ],
});

function marketPath(m: { slug?: string; id: string }): string {
  return `/market/${m.slug || m.id}`;
}

export default async function Page() {
  // Off-chain disabled → don't SSR-fetch predit markets (also keeps them out of
  // the JSON-LD); the client list renders on-chain (PAMM) markets instead.
  // The cards the list opens on, and the Trending section above them, in the
  // server HTML rather than fetched after the scripts load — the section
  // too, or its arrival would push the list down. Either failing leaves
  // that part to the browser, as before.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const [{ data }, pamm] = await Promise.all([
    OFFCHAIN_MARKETS_ENABLED
      ? fetchMarketList(12)
      : { data: [] as Market[], hasNextPage: false },
    serverListPammMarkets(DEFAULT_PAMM_MARKET_LIST).catch(() => null),
    queryClient.prefetchQuery({
      queryKey: TRENDING_SECTION_KEY,
      queryFn: () => getTrendingSectionMarkets(serverListPammMarkets),
    }),
    queryClient.prefetchQuery({
      queryKey: HIGHLIGHT_SECTION_KEY,
      queryFn: serverPammHighlight,
    }),
  ]);

  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Predit Prediction Markets',
    itemListOrder: 'https://schema.org/ItemListOrderDescending',
    numberOfItems: data.length,
    itemListElement: data.map((m, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${SITE_URL}${marketPath(m)}`,
      name: m.question,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />

      {/* Server-rendered SEO header — crawlers index the h1 + intro
          even before the interactive client island hydrates. */}
      <header className="sr-only">
        <h1>Prediction Markets</h1>
        <p>
          Browse live prediction markets on Predit. Trade on crypto, sports,
          politics, tech, and culture with insights from expert AI oracles.
        </p>
        <nav aria-label="Featured markets">
          <ol>
            {data.map((m) => (
              <li key={m.id}>
                <a href={marketPath(m)}>{m.question}</a>
              </li>
            ))}
          </ol>
        </nav>
      </header>

      <HydrationBoundary state={dehydrate(queryClient)}>
        <PredictionsPageV2
          initialPammItems={pamm?.data}
          initialPammHasMore={pamm?.hasNextPage}
        />
      </HydrationBoundary>
    </>
  );
}
