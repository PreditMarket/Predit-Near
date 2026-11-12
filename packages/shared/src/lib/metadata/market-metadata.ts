/**
 * Server-side metadata for market pages, read from the NEAR contract.
 */

import { getAllNearMarkets, getNearMarket } from '@/lib/near/contract';
import { statusOf, toPammMarket } from '@/lib/near/map';

export interface MarketMeta {
  title: string;
  description: string;
  image?: string;
  canonicalUrl?: string;
}

// A description may carry HTML (<p>, <br>, entities). Raw in
// <meta name="description"> the entities show escaped in the search
// snippet, so strip tags, decode the common entities and trim.
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

/** An open market, as crawlers need it: where it lives and what it asks. */
interface ActivePammMarket {
  id: string;
  question: string;
  updatedAt?: string;
}

/**
 * The newest open markets for the sitemap. Never throws: a failed read just
 * means no market links this time.
 */
export async function fetchActivePammMarkets(
  limit = 50,
): Promise<ActivePammMarket[]> {
  try {
    return (await getAllNearMarkets())
      .map(toPammMarket)
      .filter((m) => m.status === 'active')
      .sort((a, b) => Number(b.id) - Number(a.id))
      .slice(0, limit)
      .map(({ id, question, updatedAt }) => ({ id, question, updatedAt }));
  } catch {
    return [];
  }
}

/** Market ids are the contract's sequence numbers. */
const readNearMarket = async (id: string) =>
  /^\d+$/.test(id) ? getNearMarket(id).catch(() => null) : null;

/** True only when the contract answered that the market does not exist, not when RPC failed. */
export async function isMissingMarket(id: string): Promise<boolean> {
  if (!/^\d+$/.test(id)) return true;
  return getNearMarket(id).then((market) => market === null, () => false);
}

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
    category: market.rules.category || undefined,
  };
}

/**
 * What the per-market SEO shell renders: the server-side header (h1, intro)
 * and the BreadcrumbList / WebPage JSON-LD.
 */
interface MarketDetailSnapshot {
  id: string;
  question: string;
  description?: string;
  image?: string;
  status?: string;
  category?: string;
}
