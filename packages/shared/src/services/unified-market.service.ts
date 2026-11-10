import {
    getMyPammTrades, PammMarket,
    PammMarketTrade
} from './pamm-market.service';
import {
    getCachedCollateral,
    getCachedCollateralDecimals,
    resolveCollateralSymbol,
} from './pamm/collaterals.service';
import type { PammMarketVersion } from './pamm/market-be';

/** Every position here comes from the NEAR market contract. */
export type MarketSource = 'pamm';

export interface UnifiedPosition {
  id: string;
  source: MarketSource;
  marketQuestion: string;
  imageUrl?: string;
  side: 'yes' | 'no';
  amount: string;
  entryPrice?: number;
  currentPrice?: number;
  pnl?: number;
  status: string;
  unit?: string;
  createdAt: string;
  sourceData: PammMarketTrade;
  xpValue?: number;
  /**
   * Payout if this side wins. Unset when it can't be known from the row alone —
   * sells, and every v3 position (its payout depends on pool-wide resolve data).
   */
  toWin?: number;
  /**
   * Actual settled payout in collateral units — set once a position is
   * resolved AND the BE has computed `redeemableAmount`. Used to render the
   * winning amount next to the Claim button. Unset until then.
   */
  payoutAmount?: number;
  shares?: number;
  marketUrl?: string;
  /** PAMM only — drives the v3-specific copy and claim behaviour. */
  marketVersion?: PammMarketVersion;
}

function normalizePammTrade(
  trade: PammMarketTrade,
  market: PammMarket,
): UnifiedPosition {
  const token = getCachedCollateral(market.collateralMint ?? '');
  const scale = 10 ** getCachedCollateralDecimals(market.collateralMint ?? '');

  // `heldAmount` is the still-held share count after netting out sells against
  // this buy (null for sell rows, and for a buy that's never had a sell netted
  // against it — both cases just fall back to the original amountOut, i.e.
  // fully held). A partial sell must shrink the displayed position rather than
  // keep showing the original full buy.
  const amountOutRaw = BigInt(trade.amountOut || '0');
  const heldOutRaw =
    trade.heldAmount != null ? BigInt(trade.heldAmount) : amountOutRaw;
  // Cost basis scales down proportionally to the fraction of shares still
  // held — mirrors the on-chain `debit_proportional` cost-scaling applied
  // when a sell is recorded, rather than leaving the original cost intact.
  const amountInRaw = BigInt(trade.amountIn || '0');
  const heldInRaw =
    trade.heldAmount != null && amountOutRaw > 0n
      ? (amountInRaw * heldOutRaw) / amountOutRaw
      : amountInRaw;

  const amountIn = Number(heldInRaw) / scale;
  const amountOut = Number(heldOutRaw) / scale;
  // On v1/v2 `amountOut` is outcome tokens, redeemable 1:1 — so it doubles as
  // the "to win" figure. On v3 it is a share count: the payout is the
  // position's cost basis plus a pro-rata slice of the losing side, which
  // can't be derived from the trade row alone. Showing the share count as a
  // currency amount there would be plainly wrong, so leave it unset.
  const isV3 = market.marketVersion === 'v3_shares';
  // Tolerate both the lowercase (v1) and UPPERCASE (v2) `side` enums.
  const sideKey = trade.side.toLowerCase();
  const isSell = sideKey.startsWith('sell');
  const side: 'yes' | 'no' =
    sideKey === 'buy_yes' || sideKey === 'sell_yes' ? 'yes' : 'no';

  let status: string = trade.status ?? 'open';
  // A cancelled market has no resolvable outcome, so it supersedes the trade's
  // own status ('open'/'won'/'lost') — set at trade time and never updated on
  // cancel. Holders sell back to the pool to reclaim collateral (see
  // PoolDetailLayout sell-only mode). Checked outside the `!trade.status` guard
  // precisely because trade.status is usually 'open' (truthy) here.
  // A refund already paid stays claimed: it is history, not something to act on.
  if (market.status === 'cancelled' && trade.status !== 'claimed') {
    status = 'cancelled';
  } else if (!trade.status) {
    if (
      market.status === 'resolved' ||
      market.status === 'pending_resolution'
    ) {
      if (market.resolution === 'yes' && side === 'yes') status = 'won';
      else if (market.resolution === 'no' && side === 'no') status = 'won';
      else if (market.resolution !== null) status = 'lost';
    }
  }

  // `settlement` is the BE's read of how the pool actually settled, written at
  // settlement time from the pool account. It stays authoritative here because
  // a one-sided v3 market auto-cancels on-chain — everyone refunds, nobody
  // wins — and any row that still claims a winner would send the user to a
  // Claim button that reverts.
  //
  // Only `auto_cancelled` overrides. A `resolved` pool is left to the logic
  // above, which additionally knows about sells netting a position CLOSED —
  // something the pool account cannot express.
  if (!isSell && trade.settlement === 'auto_cancelled') {
    status = 'cancelled';
  }

  // A sell already reclaimed — the position is closed regardless of market state.
  if (isSell) status = 'closed';

  // What this position is actually owed, in collateral.
  //
  // v3: `claimAmount`, computed by the BE off the resolved pool account —
  // cost basis for a refund, cost basis scaled by the resolve-time pot for a
  // win. NOT `redeemableAmount`, which is a SHARE COUNT on v3; rendering that
  // as currency overstated every winning position by however far its share
  // count ran past the collateral staked.
  //
  // v1/v2: `redeemableAmount` IS money there — a winning outcome token
  // redeems 1:1 — so it stays the source for those.
  const payoutRaw = isV3
    ? trade.claimAmount
    : status === 'won'
      ? trade.redeemableAmount
      : null;
  const payoutBig = payoutRaw != null ? BigInt(payoutRaw) : null;
  const payoutAmount =
    !isSell && payoutBig != null && payoutBig > 0n
      ? Number(payoutBig) / scale
      : undefined;

  return {
    id: trade.id,
    source: 'pamm',
    marketQuestion: market.question,
    side,
    amount: amountIn.toFixed(2),
    entryPrice: trade.priceYes,
    currentPrice: market.latestPriceYes,
    pnl: isSell
      ? 0
      : side === 'no'
        ? (trade.priceYes - market.latestPriceYes) * amountOut
        : (market.latestPriceYes - trade.priceYes) * amountOut,
    marketUrl: `/market/${trade.marketId}`,
    status,
    unit: resolveCollateralSymbol(market.collateralMint ?? '', token?.symbol),
    xpValue: trade.volumePxpEquivalent,
    toWin: isSell || isV3 ? undefined : amountOut,
    payoutAmount,
    shares: amountOut,
    marketVersion: market.marketVersion,
    createdAt: trade.createdAt,
    sourceData: trade,
  };
}

export async function fetchPammPositions(params?: {
  page?: number;
  limit?: number;
}): Promise<UnifiedPosition[]> {
  const tradesRes = await getMyPammTrades({ limit: 20, ...params }).catch(
    () => null,
  );
  if (!tradesRes?.data?.length) return [];

  return tradesRes.data
    .map((trade) => {
      const market = trade.market as PammMarket | null | undefined;
      return market ? normalizePammTrade(trade, market) : null;
    })
    .filter((p): p is UnifiedPosition => p !== null);
}
