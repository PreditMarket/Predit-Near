import type { Metadata } from 'next';
import { ResolveQueue } from '@/components/admin/resolve-queue';

export const metadata: Metadata = { title: 'Confirm results', robots: { index: false } };

export default function Page() {
  return <ResolveQueue />;
}
