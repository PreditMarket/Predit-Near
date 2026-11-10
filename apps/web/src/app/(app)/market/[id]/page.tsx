import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MarketDetailRouter } from '@/components/market/market-detail-router';
import { buildMetadata } from '@/lib/metadata/build-metadata';
import {
  fetchPammMarketMeta,
  fetchPammMarketDetail,
} from '@/lib/metadata/market-metadata';
import { SITE_URL } from '@/lib/site-url';

// Prices and status come live from the contract.
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  try {
    const { id } = await params;
    const m = await fetchPammMarketMeta(id);
    return buildMetadata({
      title: m?.title ?? 'Market Detail',
      description:
        m?.description ?? 'View and manage prediction market details on Predit.',
      path: `/market/${id}`,
      image: m?.image,
    });
  } catch {
    return { title: 'Predit Market' };
  }
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Market ids are the contract's sequence numbers.
  if (!/^\d+$/.test(id)) notFound();
  const market = await fetchPammMarketDetail(id);
  const pagePath = `/market/${market?.slug || id}`;
  const pageUrl = `${SITE_URL}${pagePath}`;

  const breadcrumbJsonLd = market
    ? {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Markets',
            item: `${SITE_URL}/market`,
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: market.question,
            item: pageUrl,
          },
        ],
      }
    : null;

  // Treat each market as a Question with predicted answers — closest
  // schema.org match for binary prediction markets. Helps Google
  // understand the entity even though no dedicated PredictionMarket
  // type exists.
  const questionJsonLd = market
    ? {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        url: pageUrl,
        name: market.question,
        description:
          market.description ||
          'Prediction market on Predit — trade your view on the outcome.',
        ...(market.image ? { image: market.image } : {}),
        about: {
          '@type': 'Question',
          name: market.question,
          ...(market.description ? { text: market.description } : {}),
        },
        ...(market.category?.name ? { keywords: market.category.name } : {}),
      }
    : null;

  return (
    <>
      {breadcrumbJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
        />
      )}
      {questionJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(questionJsonLd) }}
        />
      )}

      {/* Server-rendered SEO shell. Hidden from sighted users via sr-only
          (the interactive client island below renders the full UI); kept
          in the HTML so crawlers and social scrapers always see the
          question, description, and breadcrumb trail in initial markup. */}
      {market && (
        <header className="sr-only">
          <nav aria-label="Breadcrumb">
            <ol>
              <li>
                <Link href="/">Home</Link>
              </li>
              <li>
                <Link href="/markets">Markets</Link>
              </li>
              <li aria-current="page">{market.question}</li>
            </ol>
          </nav>
          <h1>{market.question}</h1>
          {market.description ? <p>{market.description}</p> : null}
        </header>
      )}

      <MarketDetailRouter />
    </>
  );
}
