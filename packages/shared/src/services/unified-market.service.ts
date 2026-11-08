import {
  Market,
  MarketOrder,
} from './market.service';
import {
  PolymarketMarket,
  PolymarketTrade,
} from './polymarket.service';
import {
  DflowDataEntity,
  DflowTradeEntity,
} from './dflow.service';
import {
  getMyPammTrades,
  getPammMarketById,
  PammMarket,
  PammMarketTrade,
} from './pamm-market.service';
import {
  getActiveQuickMarkets,
  QuickMarketResponseDto,
  quickMarketOutcomeLabels,
} from './quick-market.service';
import {
  buildBinaryOptions,
  type MarketOptionDescriptor,
} from '@/lib/market-options';
import {
  getCachedCollateral,
  getCachedCollateralDecimals,
  resolveCollateralSymbol,
} from './pamm/collaterals.service';
import type { PammMarketVersion } from './pamm/market-be';

export type MarketSource =
  | 'predit'
  | 'polymarket'
  | 'kalshi'
  | 'pamm'
  | 'quick';

export interface UnifiedMarket {
  id: string;
  source: MarketSource;
  question: string;
  imageUrl?: string;
  /** 0-100 probability percentage */
  yesPrice: number;
  noPrice: number;
  volume: string;
  endDate: string;
  /** ISO timestamp when the market was created, if known */
  createdAt?: string;
  status: string;
  tags: string[];
  /** Parent group id, if this market is one option of a multi-candidate group. */
  groupId?: string | null;
  /** Set when this feed entry is a group card (links to the group detail page). */
  groupSlug?: string;
  /** Tradable options with (custom) labels — 2 for a binary market. */
  options?: MarketOptionDescriptor[];
  /** Distinct trader count, if the source tracks it (currently: quick markets). */
  participants?: number;
  /** Creator fee in basis points, if the source tracks it (currently: quick markets). */
  creatorShareBps?: number;
  /** Original entity — needed for trade execution */
  sourceData:
    | Market
    | PolymarketMarket
    | DflowDataEntity
    | PammMarket
    | QuickMarketResponseDto;
}

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
  sourceData:
    | MarketOrder
    | PolymarketTrade
    | DflowTradeEntity
    | PammMarketTrade;
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

const QUICK_MARKET_TOKEN_NAME: Record<string, string> = {
  SOL: 'Solana',
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
};

// Fallback for backends that predate `tokenImageUrl` on
// `QuickMarketResponseDto` — same trustwallet assets the BE itself stamps
// onto the mirrored PAMM record's thumbnail.
const QUICK_MARKET_TOKEN_ICON: Record<string, string> = {
  SOL: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png',
  BTC: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/bitcoin/info/logo.png',
  ETH: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
};

// BE strike prices arrive as decimal strings padded to a fixed scale
// (e.g. "76.7700000000") — trim that down to a plain, human price.
function formatStrikePrice(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

async function normalizeQuickMarket(
  m: QuickMarketResponseDto,
): Promise<UnifiedMarket> {
  const tokenName = QUICK_MARKET_TOKEN_NAME[m.tokenSymbol] ?? m.tokenSymbol;
  // A quick market's `poolPubkey` doubles as its ordinary PAMM market id
  // (see quick-market-api.md "Trade history") — still needed for the live
  // on-chain price and creator fee, which aren't on QuickMarketResponseDto.
  // Volume/participants now come straight off `m` (BE added them directly).
  const pammMarket = await getPammMarketById(m.poolPubkey).catch(() => null);
  let yesPrice = 50;
  if (m.resolutionSide === 'yes') yesPrice = 100;
  else if (m.resolutionSide === 'no') yesPrice = 0;
  else if (pammMarket && Number.isFinite(pammMarket.latestPriceYes)) {
    // Live on-chain price only makes sense pre-resolution.
    yesPrice = pammMarket.latestPriceYes * 100;
  }
  const { yesLabel, noLabel } = quickMarketOutcomeLabels(m.direction);
  return {
    id: m.id,
    source: 'quick',
    // Prefer the mirrored PAMM market's question — it's the same text the
    // detail/trade page renders (both back onto `poolPubkey`), so this keeps
    // list and detail from disagreeing when `m.question` lags behind it.
    question:
      pammMarket?.question ??
      m.question ??
      `${tokenName} ${m.direction} $${formatStrikePrice(m.strikePriceUsd)}?`,
    imageUrl: m.tokenImageUrl ?? QUICK_MARKET_TOKEN_ICON[m.tokenSymbol],
    yesPrice,
    noPrice: 100 - yesPrice,
    volume: m.totalVolumeUsdc,
    participants: m.totalParticipants ?? pammMarket?.uniqueTraderCount ?? pammMarket?.tradeCount,
    creatorShareBps: pammMarket?.creatorShareBps,
    endDate: new Date(m.expiryTs * 1000).toISOString(),
    createdAt: m.createdAt,
    status: m.status,
    tags: ['crypto', m.tokenSymbol],
    options: buildBinaryOptions({
      marketId: m.id,
      source: 'quick',
      yesLabel,
      noLabel,
      yesPrice,
    }),
    sourceData: m,
  };
}

/**
 * Currently-tradable quick markets as `UnifiedMarket`s, real pool price
 * included. Shared by the unified feed and by `MarketList`'s standalone
 * on-chain grid — both surfaces render quick markets through this.
 */
export async function fetchActiveQuickMarkets(): Promise<UnifiedMarket[]> {
  const data = await getActiveQuickMarkets().catch(
    () => [] as QuickMarketResponseDto[],
  );
  return Promise.all(data.map(normalizeQuickMarket));
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
  if (market.status === 'cancelled') {
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
