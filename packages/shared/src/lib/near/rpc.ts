import { NEAR_RPC_URLS } from './config';

/** An RPC that stops answering must not hold up the next one. */
const RPC_TIMEOUT_MS = 10_000;

const toBase64 = (text: string) =>
  typeof window === 'undefined'
    ? Buffer.from(text, 'utf8').toString('base64')
    : btoa(unescape(encodeURIComponent(text)));

const bytesToText = (bytes: number[]) => new TextDecoder().decode(new Uint8Array(bytes));

/** Calls a read-only contract method, trying each RPC until one answers. */
export async function nearView<T>(
  contract: string,
  method: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 'view',
    method: 'query',
    params: {
      request_type: 'call_function',
      finality: 'optimistic',
      account_id: contract,
      method_name: method,
      args_base64: toBase64(JSON.stringify(args)),
    },
  });

  let lastError: unknown;
  for (const url of NEAR_RPC_URLS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        cache: 'no-store',
        signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error.message ?? 'RPC error');
      if (json.result?.error) throw new Error(json.result.error);
      return JSON.parse(bytesToText(json.result.result)) as T;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('NEAR RPC unavailable');
}

/** An account's NEAR in yocto, or null when it does not exist on chain. */
export async function getNearNativeBalance(accountId: string): Promise<bigint | null> {
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 'account',
    method: 'query',
    params: { request_type: 'view_account', finality: 'optimistic', account_id: accountId },
  });

  let lastError: unknown;
  for (const url of NEAR_RPC_URLS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        cache: 'no-store',
        signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
      });
      const json = (await res.json()) as {
        result?: { amount?: string; error?: string };
        error?: { cause?: { name?: string } };
      };
      if (json.error?.cause?.name === 'UNKNOWN_ACCOUNT') return null;
      if (json.result?.amount) return BigInt(json.result.amount);
      lastError = new Error('Unexpected account response');
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
