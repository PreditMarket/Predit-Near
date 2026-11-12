import { NextResponse } from 'next/server';

// Playwright waits for this route before it starts testing.
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ ok: true });
}
