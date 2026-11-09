import { Account, JsonRpcProvider, type KeyPairString } from 'near-api-js';
import { NEAR_RPC_URLS } from '@/lib/near/config';

export const NEAR_ACCOUNT_ID = /^(?=.{2,64}$)[a-z0-9]+([-_][a-z0-9]+)*(\.[a-z0-9]+([-_][a-z0-9]+)*)*$/;

/** An implicit account exists only once funded; a named one must be created first. */
export const isImplicitAccount = (id: string) => /^([0-9a-f]{64}|0x[0-9a-f]{40})$/.test(id);

/** A signing account from server env, or null when this deployment has none. */
export function serverAccount(accountEnv: string, keyEnv: string): Account | null {
  const accountId = process.env[accountEnv]?.trim();
  const key = process.env[keyEnv]?.trim();
  if (!accountId || !key) return null;
  return new Account(accountId, new JsonRpcProvider({ url: NEAR_RPC_URLS[0] }), key as KeyPairString);
}
