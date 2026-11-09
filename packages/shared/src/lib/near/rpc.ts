import { NEAR_RPC_URLS } from './config';

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
