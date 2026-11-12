import { getNearMarket, getNearPaused, getNearUserClaims, getNearUserMarkets } from '@/lib/near/contract';
import { USDC_DECIMALS } from '@/lib/near/config';
import { claimRows, positionRows, toPammMarket } from '@/lib/near/map';
import { useNearWallet } from '@/store/near-wallet.store';
import type { MarketRules } from './market.service';

export type PammMarketStatus =
  | 'active'
  | 'pending_resolution'
  | 'pending_resolve_review'
  | 'resolved'
  | 'cancelled';

export type PammMarketResolution = 'yes' | 'no';

export type PammTradeSide = 'buy_yes' | 'buy_no';

export interface PammMarket {
  id: string;
  question: string;
  description?: string | null;
  thumbnail?: { path: string } | null;
  tweetUrl?: string | null;
  yesLabel: string;
  noLabel: string;
  status: PammMarketStatus;
  resolution: PammMarketResolution | null;
  latestPriceYes: number;
  createdAt: string;
  updatedAt: string;
  rules?: MarketRules | null;
  totalVolumeUsdc?: number;
}

export type PammTradeStatus = 'open' | 'won' | 'lost' | 'claimed';

/** One side of an account's position on a market. */
export interface PammMarketTrade {
  id: string;
  marketId: string;
  side: PammTradeSide;
  status: PammTradeStatus;
  /** Cost paid for this side, raw units. */
  amountIn: string;
  /** Shares held. Not a payout: winners are paid by cost, not shares. */
  amountOut: string;
  /** A one-sided or invalid market pays everyone back rather than naming a winner. */
  settlement: 'unresolved' | 'resolved' | 'auto_cancelled';
  /** Which call pays this side: `refund` covers both sides, `redeem` only the winner. */
  claimAction: 'redeem' | 'refund' | null;
  /** Set once paid out: a redeem was a right call, a refund neither. */
  claimKind?: 'redeem' | 'refund';
  /** Collateral owed (or paid), raw units. */
  claimAmount: string | null;
  priceYes: number;
  createdAt: string;
  market: PammMarket;
}

export interface ListPammTradesResponse {
  data: PammMarketTrade[];
  hasNextPage: boolean;
  total: number;
}

/** Every side of every position the connected account holds, newest market first. */
const myNearPositionRows = async (): Promise<PammMarketTrade[]> => {
  const accountId = useNearWallet.getState().accountId;
  if (!accountId) return [];
  const [held, claims] = await Promise.all([getNearUserMarkets(accountId), getNearUserClaims(accountId)]);
  return held
    .flatMap(([market, position]) => {
      const claim = claims.get(market.id);
      return [...positionRows(market, position), ...(claim ? claimRows(market, position, claim) : [])];
    })
    .reverse();
};

export const getPammMarketById = async (id: string): Promise<PammMarket> => {
  const market = await getNearMarket(id);
  if (!market) throw new Error('Market not found');
  return toPammMarket(market);
};

/** The contract's pause switch: it halts every trade, redeem and refund. */
export const getPammGlobalPause = (): Promise<boolean> => getNearPaused();

export interface PammMarketSummary {
  totalValue: number;
  openCount: number;
  wins: number;
  losses: number;
  winRate: number;
}

export const getMyPammTrades = async (params?: {
  page?: number;
  limit?: number;
}): Promise<ListPammTradesResponse> => {
  const rows = await myNearPositionRows();
  const page = params?.page ?? 1;
  const limit = params?.limit ?? 20;
  const start = (page - 1) * limit;
  return {
    data: rows.slice(start, start + limit),
    hasNextPage: start + limit < rows.length,
    total: rows.length,
  };
};

export const getMyPammSummary = async (): Promise<PammMarketSummary> => {
  const all = await myNearPositionRows();
  // Paid-out rows are history: their money is back in the wallet.
  const rows = all.filter((r) => r.status !== 'claimed');
  const stake = (r: PammMarketTrade) => Number(r.amountIn) / 10 ** USDC_DECIMALS;
  const value = (r: PammMarketTrade) =>
    r.status === 'lost' ? 0 : r.claimAmount != null ? Number(r.claimAmount) / 10 ** USDC_DECIMALS : stake(r);
  const wins = rows.filter((r) => r.status === 'won').length + all.filter((r) => r.claimKind === 'redeem').length;
  const losses = rows.filter((r) => r.status === 'lost').length;
  const settled = wins + losses;
  return {
    totalValue: rows.reduce((sum, r) => sum + value(r), 0),
    openCount: rows.filter((r) => r.status === 'open').length,
    wins,
    losses,
    winRate: settled > 0 ? (wins / settled) * 100 : 0,
  };
};
