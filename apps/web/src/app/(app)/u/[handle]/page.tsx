import type { Metadata } from 'next';
import { AuthorRecord } from '@/components/record/author-record';

type Params = { handle: string };

const handleOf = (param: string) => decodeURIComponent(param).replace(/^@/, '');

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  return { title: `@${handleOf((await params).handle)}: forecasting record` };
}

export default async function Page({ params }: { params: Promise<Params> }) {
  return <AuthorRecord handle={handleOf((await params).handle)} />;
}
