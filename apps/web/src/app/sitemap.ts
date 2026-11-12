import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site-url';
import { fetchActivePammMarkets } from '@/lib/metadata/market-metadata';

const SITE = SITE_URL;

/**
 * Sitemap generator — the static pages plus every active market.
 * Read live from the contract on each request.
 */
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE}/markets`, lastModified: now, changeFrequency: 'hourly', priority: 0.9 },
  ];

  const markets = await fetchActivePammMarkets(50);
  const marketRoutes: MetadataRoute.Sitemap = markets.map((m) => ({
    url: `${SITE}/market/${m.id}`,
    lastModified: m.updatedAt ? new Date(m.updatedAt) : now,
    changeFrequency: 'hourly',
    priority: 0.8,
  }));

  return [...staticRoutes, ...marketRoutes];
}
