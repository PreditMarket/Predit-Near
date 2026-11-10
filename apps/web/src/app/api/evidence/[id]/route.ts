import { NextResponse } from 'next/server';
import { readBundle } from '@/lib/resolve/evidence-store';

export const dynamic = 'force-dynamic';

/** A market's source snapshot and NEAR AI reading, public so anyone can recheck them. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const bundle = await readBundle((await params).id);
  return bundle ? NextResponse.json(bundle) : NextResponse.json({ error: 'Not found' }, { status: 404 });
}
