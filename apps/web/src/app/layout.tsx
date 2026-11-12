import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { SITE_URL } from '@/lib/site-url';
import { ErrorBoundary } from '@/components/error/error-boundary';
import { appleStartupImages } from '@/lib/pwa/splash';
import { ServiceWorkerRegistrar } from '@/components/pwa/service-worker-registrar';
import { InstallBanner } from '@/components/pwa/install-banner';

// Self-hosted at build time: no request to Google, no render-blocking CSS hop.
// globals.css maps --font-sans / --font-mono onto these variables.
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-space-grotesk',
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Predit: predictions from the posts you read',
    template: '%s | Predit',
  },
  description:
    'Turn a post into a prediction market. Rules are locked on NEAR, positions are in USDC, NEAR AI reads the result and a person confirms it, open to challenge.',
  keywords: ['prediction markets', 'NEAR', 'NEAR AI', 'social predictions', 'forecasting record'],
  authors: [{ name: 'Predit' }],
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    siteName: 'Predit',
    title: 'Predit: predictions from the posts you read',
    description:
      'Turn a post into a prediction market. Rules are locked on NEAR, positions are in USDC, NEAR AI reads the result and a person confirms it, open to challenge.',
    images: ['/prediction-default.jpg'],
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Predit: predictions from the posts you read',
    description:
      'Turn a post into a prediction market. Rules are locked on NEAR, positions are in USDC, NEAR AI reads the result and a person confirms it, open to challenge.',
    images: ['/prediction-default.jpg'],
  },
  // The web app manifest is app/manifest.ts — Next links it on its own.
  icons: {
    icon: '/logo-MarkGray.svg',
    apple: { url: '/icons/apple-touch-icon-180.png', sizes: '180x180' },
  },
  // iOS reads none of the manifest's launch settings: a standalone web app
  // needs these, and one launch image per screen size.
  appleWebApp: {
    capable: true,
    title: 'Predit',
    statusBarStyle: 'black-translucent',
    startupImage: appleStartupImages(),
  },
  alternates: { canonical: '/' },
};

export const viewport: Viewport = {
  // Same as the manifest's theme_color / background_color (--background).
  themeColor: '#14141C',
  width: 'device-width',
  initialScale: 1,
  // Lets env(safe-area-inset-*) report the notch / home-indicator insets.
  // Edge to edge under iOS's translucent status bar when installed; the app
  // shell pads itself with env(safe-area-inset-*).
  viewportFit: 'cover',
};

// Three top-level entities so Google can attribute the brand, the
// site, and the app product separately:
//   - Organization: who we are (logo, social links) → sitelinks/knowledge panel
//   - WebSite: search action enables the SERP sitelinks searchbox
//   - WebApplication: product entity (free, finance category)
const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${SITE_URL}/#organization`,
  name: 'Predit Market',
  url: SITE_URL,
  logo: {
    '@type': 'ImageObject',
    url: `${SITE_URL}/logo.png`,
  },
  sameAs: [
    'https://x.com/preditmarket',
  ],
};

const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${SITE_URL}/#website`,
  url: SITE_URL,
  name: 'Predit Market',
  publisher: { '@id': `${SITE_URL}/#organization` },
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: `${SITE_URL}/markets?search={search_term_string}`,
    },
    'query-input': 'required name=search_term_string',
  },
  inLanguage: 'en',
};

const webAppJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Predit',
  description: 'Prediction markets created from social posts, settled on NEAR.',
  url: SITE_URL,
  applicationCategory: 'FinanceApplication',
  publisher: { '@id': `${SITE_URL}/#organization` },
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <Providers>
          <ErrorBoundary>{children}</ErrorBoundary>
          <ServiceWorkerRegistrar />
          <InstallBanner />
        </Providers>

        {/* Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(webAppJsonLd) }}
        />
      </body>
    </html>
  );
}
