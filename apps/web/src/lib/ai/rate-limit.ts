const DAY_MS = 86_400_000;

/** Counts per key for the current UTC day, in this server's memory. */
const shared = globalThis as unknown as { __rateLimit?: Map<string, { day: number; count: number }> };
const counts = (shared.__rateLimit ??= new Map());

/** True, and counted, when `key` is still under `limit` today. */
export function allow(key: string, limit: number): boolean {
  const today = Math.floor(Date.now() / DAY_MS);
  const entry = counts.get(key);
  const count = entry && entry.day === today ? entry.count : 0;
  if (count >= limit) return false;
  counts.set(key, { day: today, count: count + 1 });
  return true;
}
