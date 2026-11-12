import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site-url';

const SITE = SITE_URL;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/markets', '/market/', '/u/'],
        disallow: ['/admin', '/api', '/portfolio'],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
