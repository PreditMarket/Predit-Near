import type { Metadata } from 'next';
import PredictionsPageV2 from '@/components/predictions-page-v2';
import { buildMetadata } from '@/lib/metadata/build-metadata';

// The list reads the contract in the browser; the category comes from the URL.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildMetadata({
  title: 'Markets',
  description: 'Prediction markets created from social posts, traded in USDC and settled on NEAR.',
  path: '/markets',
  ogType: 'website',
});

export default function Page() {
  return <PredictionsPageV2 />;
}
