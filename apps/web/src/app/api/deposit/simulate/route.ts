import { NextResponse, type NextRequest } from 'next/server';
import { NEAR_USDC_CONTRACT, USDC_DECIMALS } from '@/lib/near/config';
import { SIMULATED_CHAINS } from '@/lib/near/simulated-deposit';
import { getNearNativeBalance, nearView } from '@/lib/near/rpc';
import { NEAR_ACCOUNT_ID, serverAccount } from '@/lib/server-near-account';

export const dynamic = 'force-dynamic';

const UNIT = BigInt(10) ** BigInt(USDC_DECIMALS);
const MAX_PER_DEPOSIT = 1_000;
const MAX_BALANCE = BigInt(5_000) * UNIT;
const SIMULATE_GAS = BigInt(50_000_000_000_000);

/** Testnet only: credits mock USDC as if a deposit had arrived from another chain. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    accountId?: unknown;
    chain?: unknown;
    amount?: unknown;
  };
  const { accountId, chain, amount } = body;
  if (typeof accountId !== 'string' || !NEAR_ACCOUNT_ID.test(accountId)) {
    return NextResponse.json({ error: 'Invalid account' }, { status: 400 });
  }
  if (!SIMULATED_CHAINS.some((c) => c.id === chain)) {
    return NextResponse.json({ error: 'Unknown chain' }, { status: 400 });
  }
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 1 || amount > MAX_PER_DEPOSIT) {
    return NextResponse.json({ error: `Amount must be 1 to ${MAX_PER_DEPOSIT}` }, { status: 400 });
  }
  if ((await getNearNativeBalance(accountId)) === null) {
    return NextResponse.json({ error: 'Account does not exist yet' }, { status: 404 });
  }
  const balance = BigInt(
    await nearView<string>(NEAR_USDC_CONTRACT, 'ft_balance_of', { account_id: accountId }),
  );
  if (balance >= MAX_BALANCE) {
    return NextResponse.json({ error: 'This account already holds the simulation limit' }, { status: 429 });
  }

  const token = serverAccount('NEAR_USDC_ACCOUNT', 'NEAR_USDC_SIMULATE_KEY');
  if (!token) return NextResponse.json({ error: 'Simulation is not configured' }, { status: 503 });

  try {
    const outcome = await token.callFunctionRaw({
      contractId: NEAR_USDC_CONTRACT,
      methodName: 'simulate_deposit',
      args: {
        account_id: accountId,
        amount: BigInt(Math.floor(amount * 10 ** USDC_DECIMALS)).toString(),
      },
      gas: SIMULATE_GAS,
    });
    return NextResponse.json({ status: 'SUCCESS', txHash: outcome.transaction.hash });
  } catch (err) {
    console.error('simulate_deposit failed', err);
    return NextResponse.json({ error: 'Simulated deposit failed' }, { status: 502 });
  }
}
