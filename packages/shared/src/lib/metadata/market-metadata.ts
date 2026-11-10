/**
 * Server-side metadata for market pages, read from the NEAR contract.
 */

import { getNearMarket } from '@/lib/near/contract';
import { statusOf } from '@/lib/near/map';
import { listNearMarkets } from '@/lib/near/market-list';


export interface MarketMeta {
  title: string;
  description: string;
  image?: string;
  canonicalUrl?: string;
}

// Backend stores `description` as rich-text HTML (<p>, <br>, etc.).
// Passing it raw to <meta name="description"> leaves the entities
// escaped in the SERP snippet ("&lt;p&gt;..."), which tanks CTR. Strip
// tags, collapse whitespace, decode the few common entities the
// editor emits, and trim to Google's recommended cap.
function htmlToMetaText(html: string | undefined | null, max = 200): string {
  if (!html) return '';
  return html
    .replace(/<\s*br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#x27;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** An active PAMM market, as crawlers need it: where it lives and what it asks. */
export interface ActivePammMarket {
  id: string;
  question: string;
  updatedAt?: string;
}

/**
 * Active PAMM markets for server-rendered SEO (Home links, sitemap). Grouped
 * listings are skipped — their members are reachable from the group page.
 * Never throws: a failed fetch just means no market links this time.
 */
export async function fetchActivePammMarkets(
  limit = 50,
): Promise<ActivePammMarket[]> {
  try {
    const { data } = await listNearMarkets({ page: 1, limit, status: 'active' });
    return data.flatMap((item) =>
      item.kind === 'market'
        ? [{ id: item.market.id, question: item.market.question, updatedAt: item.market.updatedAt }]
        : [],
    );
  } catch {
    return [];
  }
}

/** Market ids are the contract's sequence numbers. */
const readNearMarket = async (id: string) =>
  /^\d+$/.test(id) ? getNearMarket(id).catch(() => null) : null;

export async function fetchPammMarketMeta(id: string): Promise<MarketMeta | null> {
  const market = await readNearMarket(id);
  if (!market) return null;
  return {
    title: market.rules.question,
    description:
      htmlToMetaText(market.rules.description) ||
      'Trade on this on-chain prediction market on Predit.',
    image: market.rules.image_url || undefined,
  };
}

export async function fetchPammMarketDetail(id: string): Promise<MarketDetailSnapshot | null> {
  const market = await readNearMarket(id);
  if (!market) return null;
  return {
    id: market.id,
    question: market.rules.question,
    description: htmlToMetaText(market.rules.description, 500),
    image: market.rules.image_url || undefined,
    status: statusOf(market),
  };
}

/**
 * Server-side detail fetcher for the per-market SEO shell. Returns
 * the fields needed to render the SSR header (h1, intro) and the
 * BreadcrumbList / Event JSON-LD. Distinct from `fetchMarketMeta`
 * which is metadata-only.
 */
export interface MarketDetailSnapshot {
  id: string;
  slug?: string;
  question: string;
  description?: string;
  image?: string;
  closeAt?: string;
  status?: string;
  category?: { name?: string } | null;
}
