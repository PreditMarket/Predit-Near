'use client';

import { fmtCompactAmount } from './formatters';

interface PayWithRowProps {
  /** The pool's collateral: the one thing a buy pays with. */
  symbol: string;
  /** Wallet balance in base units; undefined while it loads. */
  rawBalance: bigint | undefined;
  decimals: number;
}

/** Coin dot 14×14. Renders Jupiter's icon when present; falls back to a
 * lettered avatar only if the icon URL 404s or was never supplied. Error
 * flag resets when the icon URL flips (enrichment lands after first paint). */
function CoinBadge({ symbol, size = 14 }: { symbol: string; size?: number }) {
  const sym = symbol.toUpperCase();
  const fallbackBg =
    sym === 'USDC' || sym === 'USDT'
      ? 'bg-primary text-background'
      : sym === 'SOL'
        ? 'bg-brand-purple text-white'
        : 'bg-card text-foreground';
  return (
    <span
      style={{ width: size, height: size }}
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${fallbackBg}`}
    >
      <span className="font-mono text-[8px] font-extrabold">{sym.slice(0, 1)}</span>
    </span>
  );
}

/** Thin row that sits flush on top of the amount input (`-mb-2` = -8px),
 * grouping the "buy with X" decision with the "how much" input. Balance
 * headline is USDC-equivalent, with the raw token amount as a caption. */
export function PayWithRow({ symbol, rawBalance, decimals }: PayWithRowProps) {
  const units = rawBalance === undefined ? null : Number(rawBalance) / 10 ** decimals;
  // Every market trades in USDC: naming it on each buy says nothing. Another
  // collateral is still named, since that is a real difference.
  const named = symbol.toUpperCase() !== 'USDC';
  return (
    <div className="-mb-[8px] flex items-center gap-[8px] px-[2px] pt-[2px]">
      {named ? (
        <>
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-faint">
            Buy with
          </span>
          <span className="inline-flex items-center gap-[4px] rounded-full border border-white/[0.06] bg-card py-[3px] pl-[4px] pr-[8px] font-mono text-[11px] font-bold text-muted-foreground">
            <CoinBadge symbol={symbol} />
            <span>{symbol}</span>
          </span>
        </>
      ) : null}
      <span className="ml-auto font-mono text-[11px] text-faint">
        Bal{' '}
        <span className="font-bold text-muted-foreground">
          {units === null ? '—' : `${fmtCompactAmount(units, symbol)} ${symbol}`}
        </span>
      </span>
    </div>
  );
}
