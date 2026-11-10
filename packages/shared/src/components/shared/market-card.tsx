'use client';

export function fmtVol(vol?: string, symbol?: string) {
  if (!vol) return null;
  const n = Number(vol);
  if (!n) return null;
  const isPxp = symbol === 'PXP';
  if (n >= 1_000_000)
    return isPxp
      ? `${(n / 1_000_000).toFixed(2)}M XP`
      : `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)
    return isPxp
      ? `${(n / 1_000).toFixed(2)}K XP`
      : `$${(n / 1_000).toFixed(2)}K`;
  return isPxp ? `${n.toFixed(2)} XP` : `$${n.toFixed(2)}`;
}
export function fmtPct(n: number) {
  return `${n.toFixed(2)}%`;
}
