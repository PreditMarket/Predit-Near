import type { Metadata } from 'next';
import { PortfolioPage } from '@/components/portfolio/page';

export const metadata: Metadata = {
  title: 'Portfolio',
  robots: { index: false },
};

/** Server shell: `loading.tsx` draws the layout until the client page mounts. */
export default function Page() {
  return <PortfolioPage />;
}
