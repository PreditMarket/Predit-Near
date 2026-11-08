import { NextResponse } from 'next/server';

// The commit this deploy was built from. The e2e workflow polls it to start
// testing staging only once Railway has rolled out the pushed commit.
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({
    commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? null,
  });
}
