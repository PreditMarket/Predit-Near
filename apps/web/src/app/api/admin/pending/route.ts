import { NextResponse } from 'next/server';
import { adminAccounts } from '@/lib/resolve/admins';
import { dueMarkets } from '@/lib/resolve/agent';
import { readBundle } from '@/lib/resolve/evidence-store';

export const dynamic = 'force-dynamic';

/** Expired markets waiting for a person. All of it is public; confirming is what's guarded. */
export async function GET() {
  const markets = await dueMarkets();
  const items = await Promise.all(markets.map(async (market) => ({ market, bundle: await readBundle(market.id) })));
  return NextResponse.json({ admins: adminAccounts(), items });
}
