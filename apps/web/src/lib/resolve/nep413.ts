import { createHash } from 'node:crypto';
import { PublicKey } from 'near-api-js';
import { NEAR_RPC_URLS } from '@/lib/near/config';

const NEP413_TAG = 2147484061;

function borshString(text: string): Buffer {
  const bytes = Buffer.from(text, 'utf8');
  const length = Buffer.alloc(4);
  length.writeUInt32LE(bytes.length);
  return Buffer.concat([length, bytes]);
}

function payloadHash(message: string, nonce: Buffer, recipient: string): Buffer {
  const tag = Buffer.alloc(4);
  tag.writeUInt32LE(NEP413_TAG);
  const noCallback = Buffer.from([0]);
  return createHash('sha256')
    .update(Buffer.concat([tag, borshString(message), nonce, borshString(recipient), noCallback]))
    .digest();
}

interface SignedMessage {
  message: string;
  recipient: string;
  nonce: Buffer;
  accountId: string;
  publicKey: string;
  signature: Buffer;
}

const RPC_TIMEOUT_MS = 10_000;

/** The key's permission, or undefined when the account has no such key. Throws if no RPC answers. */
async function accessKeyPermission(accountId: string, publicKey: string): Promise<unknown> {
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'query',
    params: { request_type: 'view_access_key', finality: 'final', account_id: accountId, public_key: publicKey },
  });
  for (const url of NEAR_RPC_URLS) {
    const res = await fetch(url, {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
      headers: { 'content-type': 'application/json' },
      body,
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as { result?: { permission?: unknown } } | null;
    if (json?.result) return json.result.permission;
  }
  throw new Error('No NEAR RPC answered');
}

/** A NEP-413 signature made with a full-access key of the claimed account. */
export async function isSignedByAccount(signed: SignedMessage): Promise<boolean> {
  if (signed.nonce.length !== 32) return false;
  try {
    const hash = payloadHash(signed.message, signed.nonce, signed.recipient);
    if (!PublicKey.fromString(signed.publicKey).verify(hash, signed.signature)) return false;
  } catch {
    return false;
  }
  return (await accessKeyPermission(signed.accountId, signed.publicKey)) === 'FullAccess';
}
