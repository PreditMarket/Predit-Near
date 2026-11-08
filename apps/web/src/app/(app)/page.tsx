import type { Metadata } from 'next';
import { HydrationBoundary } from '@tanstack/react-query';
import { HomeShell } from '@/components/home/home-shell';
import { prefetchHome } from '@/components/home/home-prefetch';
import {
  HOME_DESCRIPTION,
  HOME_TITLE,
  HomeSeo,
} from '@/components/home/home-seo';
import { buildMetadata } from '@/lib/metadata/build-metadata';
import { fetchActivePammMarkets } from '@/lib/metadata/market-metadata';

/** Market links in the server HTML refresh with the list (5 min). */
export const revalidate = 300;

export const metadata: Metadata = {
  ...buildMetadata({
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    path: '/',
    keywords: [
      'prediction market',
      'crypto prediction market',
      'Solana',
      'perps',
      'AI predictions',
      'Predit',
    ],
  }),
  // `absolute` bypasses the root layout's `%s | Predit Market AI`
  // template — otherwise the homepage title duplicates the brand.
  title: { absolute: HOME_TITLE },
};

export default async function Page() {
  const [markets, prefetched] = await Promise.all([
    fetchActivePammMarkets(20),
    prefetchHome(),
  ]);
  return (
    <>
      <HomeSeo markets={markets} />
      {/* The rail and the feed render from this on the server too. */}
      <HydrationBoundary state={prefetched}>
        <HomeShell />
      </HydrationBoundary>
    </>
  );
}
