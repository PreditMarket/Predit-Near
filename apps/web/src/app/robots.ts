import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site-url';

const SITE = SITE_URL;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/markets', '/earn', '/competition', '/subscription'],
        disallow: ['/admin', '/api', '/restricted', '/portfolio', '/chat'],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
