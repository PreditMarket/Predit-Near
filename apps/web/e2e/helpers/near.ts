import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { Account, JsonRpcProvider, KeyPair, type KeyPairString } from 'near-api-js';

/** The deployment the app reads, unless the app was built for another one. */
export const MARKET = process.env.NEXT_PUBLIC_NEAR_MARKET_CONTRACT ?? 'predit-markets-market.testnet';
export const USDC = process.env.NEXT_PUBLIC_NEAR_USDC_CONTRACT ?? 'predit-markets-usdc.testnet';
const RPC = process.env.NEAR_E2E_RPC ?? 'https://test.rpc.fastnear.com';

async function rpc<T>(method: string, params: unknown): Promise<T> {
  let last: unknown;
  for (let tries = 0; tries < 5; tries += 1) {
    try {
      const res = await fetch(RPC, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(15_000),
      });
      const body = (await res.json()) as { result?: T; error?: unknown };
      if (body.result !== undefined) return body.result;
      last = body.error;
    } catch (err) {
      last = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  throw new Error(`NEAR RPC ${method} failed: ${JSON.stringify(last)}`);
}

export async function view<T>(contract: string, method: string, args: Record<string, unknown> = {}): Promise<T> {
  const result = await rpc<{ result: number[] }>('query', {
    request_type: 'call_function',
    finality: 'optimistic',
    account_id: contract,
    method_name: method,
    args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
  });
  return JSON.parse(Buffer.from(result.result).toString()) as T;
}

export interface ChainMarket {
  id: string;
  status: string;
  outcome: unknown;
  refunds_only: boolean;
  post: { post_id: string; author_ref: string };
  rules: { question: string; yes_label: string; no_label: string; expiry_sec: string; resolution_source: string };
  trade_freeze_sec: number;
  receipt: { reason: string; evidence: { uri: string; hash: string } } | null;
}

export const allMarkets = () => view<ChainMarket[]>(MARKET, 'get_markets', { from: '0', limit: 200 });

export const isTradable = (m: ChainMarket) =>
  m.status === 'open' && Date.now() / 1000 < Number(m.rules.expiry_sec) - m.trade_freeze_sec - 600;

export const usdcBalance = async (accountId: string) =>
  BigInt(await view<string>(USDC, 'ft_balance_of', { account_id: accountId }));

const credentialsDir = () =>
  process.env.NEAR_CREDENTIALS_DIR ?? path.join(homedir(), '.near-credentials', 'testnet');

/** A full-access key for the account from the local NEAR credentials, never from the repo. */
export async function keyFor(accountId: string): Promise<KeyPairString> {
  const dir = credentialsDir();
  const files = [path.join(dir, `${accountId}.json`)];
  try {
    files.push(...readdirSync(path.join(dir, accountId)).map((f) => path.join(dir, accountId, f)));
  } catch {
    // Only the flat file exists.
  }
  for (const file of files) {
    let key: { public_key: string; private_key: string };
    try {
      key = JSON.parse(readFileSync(file, 'utf8')) as typeof key;
    } catch {
      continue;
    }
    const access = await rpc<{ permission?: unknown }>('query', {
      request_type: 'view_access_key',
      finality: 'final',
      account_id: accountId,
      public_key: key.public_key,
    }).catch(() => null);
    if (access?.permission === 'FullAccess') return key.private_key as KeyPairString;
  }
  throw new Error(`No full-access key for ${accountId} in ${dir}`);
}

/** An account signing with a key the test holds, e.g. a brand-new implicit account. */
export const accountWithKey = (accountId: string, privateKey: string) =>
  new Account(accountId, new JsonRpcProvider({ url: RPC }), privateKey as KeyPairString);

export const signerFor = async (accountId: string) =>
  new Account(accountId, new JsonRpcProvider({ url: RPC }), await keyFor(accountId));

/** A NEP-413 signature, as a wallet's signMessage returns it. */
export async function signNep413(accountId: string, message: string, nonce: Uint8Array, recipient: string) {
  const string = (text: string) => {
    const bytes = Buffer.from(text, 'utf8');
    const length = Buffer.alloc(4);
    length.writeUInt32LE(bytes.length);
    return Buffer.concat([length, bytes]);
  };
  const tag = Buffer.alloc(4);
  tag.writeUInt32LE(2147484061);
  const payload = Buffer.concat([tag, string(message), Buffer.from(nonce), string(recipient), Buffer.from([0])]);
  const hash = createHash('sha256').update(payload).digest();
  const keyPair = KeyPair.fromString(await keyFor(accountId));
  return {
    accountId,
    publicKey: keyPair.getPublicKey().toString(),
    signature: Buffer.from(keyPair.sign(hash).signature).toString('base64'),
  };
}

export interface FunctionCall {
  receiverId: string;
  methodName: string;
  args: Record<string, unknown>;
  gas: string;
  deposit: string;
}

/** Signs and sends one call; throws with the contract's message when it fails. */
export async function send(account: Account, call: FunctionCall) {
  const outcome = await account.callFunctionRaw({
    contractId: call.receiverId,
    methodName: call.methodName,
    args: call.args,
    gas: BigInt(call.gas),
    deposit: BigInt(call.deposit),
  });
  const status = outcome.status as { Failure?: unknown } | string;
  if (typeof status === 'object' && status.Failure) {
    throw new Error(`${call.methodName} failed: ${JSON.stringify(status.Failure).slice(0, 300)}`);
  }
  return outcome;
}
