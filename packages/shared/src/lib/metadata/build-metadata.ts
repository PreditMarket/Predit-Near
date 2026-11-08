import type { Metadata } from 'next';

interface BuildMetadataParams {
  title: string;
  description: string;
  path: string;
  /** Pass `null` (not just omit) to leave `openGraph.images`/`twitter.images`
   * unset entirely — needed for routes with their own `opengraph-image.tsx`
   * file-convention route, since Next only auto-merges that generated image
   * in when metadata doesn't already declare one explicitly. Omitting the
   * prop (`undefined`) keeps the default fallback image, same as before. */
  image?: string | null;
  keywords?: string[];
  canonicalUrl?: string;
  ogType?: 'website' | 'article';
  publishedTime?: string;
  authors?: string[];
  section?: string;
}

const DEFAULT_IMAGE = '/prediction-default.jpg';

export function buildMetadata({
  title,
  description,
  path,
  image,
  keywords,
  canonicalUrl,
  ogType = 'website',
  publishedTime,
  authors,
  section,
}: BuildMetadataParams): Metadata {
  const ogImage = image === null ? null : (image ?? DEFAULT_IMAGE);
  const canonical = canonicalUrl ?? path;
  const isArticle = ogType === 'article';
  return {
    title,
    description,
    ...(keywords && keywords.length ? { keywords } : {}),
    ...(authors && authors.length
      ? { authors: authors.map((name) => ({ name })) }
      : {}),
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      ...(ogImage ? { images: [ogImage] } : {}),
      type: ogType,
      ...(isArticle && publishedTime ? { publishedTime } : {}),
      ...(isArticle && authors && authors.length ? { authors } : {}),
      ...(isArticle && section ? { section } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  };
}
