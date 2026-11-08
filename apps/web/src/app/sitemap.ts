import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site-url';
import { fetchActivePammMarkets } from '@/lib/metadata/market-metadata';

const SITE = SITE_URL;

/**
 * Sitemap generator — the static pages plus every active market.
 * ISR-revalidates every 10 min.
 */
export const revalidate = 600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE}/market`, lastModified: now, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${SITE}/earn`, lastModified: now, changeFrequency: 'daily', priority: 0.6 },
    { url: `${SITE}/competition`, lastModified: now, changeFrequency: 'daily', priority: 0.6 },
    { url: `${SITE}/subscription`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE}/terms-of-service`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
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
