'use client';

export function fmtVol(vol?: string) {
  if (!vol) return null;
  const n = Number(vol);
  if (!n) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}
export function fmtPct(n: number) {
  return `${n.toFixed(2)}%`;
}
