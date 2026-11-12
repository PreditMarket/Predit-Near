import { USDC_DECIMALS, USDC_SYMBOL } from '@/lib/near/config';
import { getMyPammTrades, type PammMarketTrade } from './pamm-market.service';

/** One side of a position, as the portfolio lists it. */
export interface UnifiedPosition {
  id: string;
  marketQuestion: string;
  side: 'yes' | 'no';
  amount: string;
  entryPrice?: number;
  currentPrice?: number;
  status: string;
  unit?: string;
  createdAt: string;
  sourceData: PammMarketTrade;
  /** What this side is owed (or was paid), in collateral. Unset when nothing. */
  payoutAmount?: number;
  shares?: number;
  marketUrl?: string;
}

const SCALE = 10 ** USDC_DECIMALS;

function normalizePammTrade(trade: PammMarketTrade): UnifiedPosition {
  const { market } = trade;
  const side: 'yes' | 'no' = trade.side === 'buy_yes' ? 'yes' : 'no';

  // A refund supersedes the yes/no status; one already paid stays claimed.
  const status: string =
    trade.status !== 'claimed' &&
    (market.status === 'cancelled' || trade.settlement === 'auto_cancelled')
      ? 'cancelled'
      : trade.status;

  const payoutBig = trade.claimAmount != null ? BigInt(trade.claimAmount) : null;

  return {
    id: trade.id,
    marketQuestion: market.question,
    side,
    amount: (Number(trade.amountIn) / SCALE).toFixed(2),
    entryPrice: trade.priceYes,
    currentPrice: market.latestPriceYes,
    marketUrl: `/market/${trade.marketId}`,
    status,
    unit: USDC_SYMBOL,
    payoutAmount: payoutBig != null && payoutBig > 0n ? Number(payoutBig) / SCALE : undefined,
    shares: Number(trade.amountOut) / SCALE,
    createdAt: trade.createdAt,
    sourceData: trade,
  };
}

export async function fetchPammPositions(params?: {
  page?: number;
  limit?: number;
}): Promise<UnifiedPosition[]> {
  const tradesRes = await getMyPammTrades({ limit: 20, ...params }).catch(() => null);
  return tradesRes?.data.map(normalizePammTrade) ?? [];
}
