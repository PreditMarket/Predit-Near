import { NEAR_MARKET_CONTRACT } from '@/lib/near/config';
import { serverAccount } from '@/lib/server-near-account';

const GAS = BigInt(150_000_000_000_000);

export const operatorAccount = () => serverAccount('NEAR_OPERATOR_ACCOUNT', 'NEAR_OPERATOR_KEY');

/**
 * One key, one nonce sequence: calls run one at a time. The queue lives on
 * globalThis because the agent and the routes are bundled separately.
 */
const shared = globalThis as unknown as { __operatorQueue?: Promise<unknown> };

export function operatorCall(methodName: 'post_receipt' | 'finalize', args: Record<string, unknown>): Promise<void> {
  const run = async () => {
    const account = operatorAccount();
    if (!account) throw new Error('No operator key on this deployment');
    const outcome = await account.callFunctionRaw({ contractId: NEAR_MARKET_CONTRACT, methodName, args, gas: GAS });
    const status = outcome.status as { Failure?: unknown } | string;
    if (typeof status === 'object' && status.Failure) {
      throw new Error(`${methodName} failed: ${JSON.stringify(status.Failure).slice(0, 300)}`);
    }
  };
  const result = (shared.__operatorQueue ?? Promise.resolve()).then(run, run);
  shared.__operatorQueue = result.catch(() => undefined);
  return result;
}
