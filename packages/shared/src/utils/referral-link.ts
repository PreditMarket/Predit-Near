import { useMemo } from 'react';
import { SITE_URL } from '@/lib/site-url';

function toAbsolute(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const origin = typeof window !== 'undefined' ? window.location.origin : SITE_URL;
  return `${origin}${url.startsWith('/') ? '' : '/'}${url}`;
}

/** The absolute link to share for a page of this site. */
export function useShareUrl(url: string): string {
  return useMemo(() => toAbsolute(url), [url]);
}
