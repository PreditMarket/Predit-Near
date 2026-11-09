import type { Metadata } from 'next';
import { HomeShell } from '@/components/home/home-shell';

export const metadata: Metadata = {
  title: { absolute: 'Predit: predictions from the posts you read' },
  description: 'Turn a post into a YES/NO market, then see the result back on that post.',
};

export default function Page() {
  return <HomeShell />;
}
