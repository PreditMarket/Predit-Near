const PII_KEYS = new Set(['email', 'wallet', 'jwt', 'signature', 'phone', 'authorization', 'token']);

// EVM wallet: 0x followed by 40 hex chars
const EVM_WALLET_RE = /0x[0-9a-fA-F]{40}/g;
// NEAR account: a named `.near` / `.testnet` account, or a 64-hex implicit one
const NEAR_ACCOUNT_RE = /\b(?:[a-z0-9_-]+\.)+(?:near|testnet)(?![\w-]|\.\w)|\b[0-9a-f]{64}\b/g;
// JWT: three base64url segments
const JWT_RE = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

function maskWallets(value: string): string {
  return value
    .replace(EVM_WALLET_RE, '[EVM_WALLET]')
    .replace(NEAR_ACCOUNT_RE, '[NEAR_ACCOUNT]')
    .replace(JWT_RE, '[JWT]');
}

function scrubValue(key: string, value: unknown): unknown {
  if (PII_KEYS.has(key.toLowerCase())) return '[REDACTED]';
  if (typeof value === 'string') return maskWallets(value);
  return value;
}

export function scrubPII(obj: unknown, depth = 0): unknown {
  // Guard against deep recursion
  if (depth > 10) return obj;
  if (obj === null || obj === undefined) return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => scrubPII(item, depth + 1));
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = scrubValue(key, scrubPII(value, depth + 1));
    }
    return result;
  }

  if (typeof obj === 'string') return maskWallets(obj);

  return obj;
}
