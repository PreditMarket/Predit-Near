import { NextResponse, type NextRequest } from 'next/server';
import { getNearNativeBalance } from '@/lib/near/rpc';
import { isImplicitAccount, NEAR_ACCOUNT_ID, serverAccount } from '@/lib/server-near-account';

export const dynamic = 'force-dynamic';

const ONE_NEAR = BigInt(10) ** BigInt(24);
// NEAR checks an account can cover all the gas it attaches before running a
// transaction, and refunds what is unused. A 150 Tgas bet needs about 0.15 NEAR
// on hand, though it spends a small fraction of that.
const GRANT = ONE_NEAR / BigInt(4); // 0.25 NEAR
const ENOUGH = ONE_NEAR / BigInt(5); // 0.2 NEAR

/**
 * Gas for an account that has none. There is no database, so the limit is the
 * chain itself: an account already holding gas gets nothing.
 */
export async function POST(req: NextRequest) {
  const { accountId } = (await req.json().catch(() => ({}))) as { accountId?: unknown };
  if (typeof accountId !== 'string' || !NEAR_ACCOUNT_ID.test(accountId)) {
    return NextResponse.json({ error: 'Invalid account' }, { status: 400 });
  }

  const balance = await getNearNativeBalance(accountId);
  if (balance === null && !isImplicitAccount(accountId)) {
    return NextResponse.json({ error: 'Account does not exist' }, { status: 404 });
  }
  if (balance !== null && balance >= ENOUGH) return NextResponse.json({ funded: false });

  const funder = serverAccount('NEAR_ONBOARD_ACCOUNT', 'NEAR_ONBOARD_KEY');
  if (!funder) return NextResponse.json({ error: 'Gas funding is not configured' }, { status: 503 });

  try {
    const outcome = await funder.transfer({ receiverId: accountId, amount: GRANT });
    return NextResponse.json({ funded: true, amount: '0.25', txHash: outcome.transaction.hash });
  } catch (err) {
    console.error('onboard transfer failed', err);
    return NextResponse.json({ error: 'Could not send gas' }, { status: 502 });
  }
}
