/**
 * Server-side metadata fetchers for dynamic market pages.
 * Uses plain fetch() with ISR caching — no axios (client-only).
 *
 * `API_BASE` already ends in `/api/v1` per NEXT_PUBLIC_API_BASE_URL convention.
 * Do NOT prepend `/api/v1` again in route paths.
 *
 * OG images come from backend-rendered PNG endpoints (see deor-be
 * market-og-image.controller.ts): `/{source}/:id/og-image.png`. URL is
 * deterministic, no entity fetch needed for the image itself — entity fetch
 * remains for title/description.
 */

import { SERVER_FETCH_HEADERS } from '@/lib/server-api';
import { getNearMarket } from '@/lib/near/contract';
import { statusOf } from '@/lib/near/map';
import { listNearMarkets } from '@/lib/near/market-list';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? '').replace(/\/$/, '');


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

async function safeFetch<T>(
  url: string,
  init?: { revalidate?: number; tags?: string[] },
): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: SERVER_FETCH_HEADERS,
      next: {
        revalidate: init?.revalidate ?? 60,
        ...(init?.tags ? { tags: init.tags } : {}),
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

interface RawMarket {
  question?: string;
  description?: string;
}

/**
 * Server-side list fetcher for the markets index page. Pre-fetches the
 * first page so SSR HTML contains the market cards + internal links to
 * each market detail page — crawlers can index the list and discover
 * individual markets.
 *
 * Defaults match the client `MarketList` initial state (status=open,
 * sort=volume desc) so the SSR snapshot lines up with what a fresh
 * visitor would see before any filter changes.
 */
export interface ListedMarket {
  id: string;
  slug?: string;
  shortCode?: string;
  question: string;
  description?: string;
  image?: { path?: string } | null;
  imageUrl?: string;
  yesPool?: number;
  noPool?: number;
  closeAt?: string;
  status?: string;
}

export interface MarketListResult {
  data: ListedMarket[];
  hasNextPage: boolean;
}

export async function fetchMarketList(
  limit = 12,
): Promise<MarketListResult> {
  try {
    const params = new URLSearchParams({
      page: '1',
      limit: String(limit),
      status: 'open',
      sort: 'volume',
      order: 'desc',
    });
    const res = await fetch(`${API_BASE}/market?${params.toString()}`, {
      headers: SERVER_FETCH_HEADERS,
      next: { revalidate: 300, tags: ['market-list'] },
    });
    if (!res.ok) return { data: [], hasNextPage: false };
    const raw = (await res.json()) as {
      data?: ListedMarket[];
      hasNextPage?: boolean;
    };
    return {
      data: raw.data ?? [],
      hasNextPage: !!raw.hasNextPage,
    };
  } catch {
    return { data: [], hasNextPage: false };
  }
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

export async function fetchMarketMeta(id: string): Promise<MarketMeta | null> {
  const raw = await safeFetch<RawMarket>(`${API_BASE}/market/${id}`);
  if (!raw) return null;
  const clean = htmlToMetaText(raw.description);
  return {
    title: raw.question ?? 'Market Detail',
    description: clean || 'View and manage prediction market details on Predit.',
    image: `${API_BASE}/market/${id}/og-image.png`,
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

export async function fetchMarketDetail(
  id: string,
): Promise<MarketDetailSnapshot | null> {
  const raw = await safeFetch<{
    id?: string;
    slug?: string;
    question?: string;
    description?: string;
    image?: { path?: string } | null;
    imageUrl?: string;
    closeAt?: string;
    status?: string;
    category?: { name?: string } | null;
  }>(`${API_BASE}/market/${id}`);
  if (!raw || !raw.question) return null;
  return {
    id: raw.id ?? id,
    slug: raw.slug,
    question: raw.question,
    description: htmlToMetaText(raw.description, 500),
    // Pin OG/JSON-LD image to the backend-rendered card so social
    // shares always show the branded preview (matches whatever the
    // backend generates for the gated share page). Skip raw asset to
    // keep one source of truth across surfaces.
    image: `${API_BASE}/market/${id}/og-image.png`,
    closeAt: raw.closeAt,
    status: raw.status,
    category: raw.category ?? null,
  };
}
