import type {
  ListPammMarketsParams,
  ListPammMarketsResponse,
  PammMarket,
} from '@/services/pamm-market.service';
import { getAllNearMarkets } from './contract';
import { toPammMarket } from './map';

function compare(sort: ListPammMarketsParams['sort']) {
  switch (sort) {
    case 'volume':
      return (a: PammMarket, b: PammMarket) => (a.totalVolumeUsdc ?? 0) - (b.totalVolumeUsdc ?? 0);
    case 'orders':
      return (a: PammMarket, b: PammMarket) => (a.tradeCount ?? 0) - (b.tradeCount ?? 0);
    case 'ending':
      return (a: PammMarket, b: PammMarket) => Number(a.expiryTs) - Number(b.expiryTs);
    default:
      return (a: PammMarket, b: PammMarket) => Number(a.id) - Number(b.id);
  }
}

/** The market list from the contract, filtered and paged here. */
export async function listNearMarkets(
  params: ListPammMarketsParams = {},
): Promise<ListPammMarketsResponse> {
  // No market is featured on chain, so the Trending section is simply empty.
  if (params.isTrending) return { data: [], hasNextPage: false, total: 0 };

  const search = params.search?.trim().toLowerCase();
  const direction = params.order === 'asc' ? 1 : -1;
  const markets = (await getAllNearMarkets())
    .map(toPammMarket)
    .filter((m) => !params.status || m.status === params.status)
    .filter((m) => !params.categoryId || m.categoryId === params.categoryId)
    .filter((m) => !search || m.question.toLowerCase().includes(search))
    .filter((m) => params.minVolume == null || (m.totalVolumeUsdc ?? 0) >= params.minVolume)
    .filter((m) => params.maxVolume == null || (m.totalVolumeUsdc ?? 0) <= params.maxVolume)
    .sort((a, b) => direction * compare(params.sort)(a, b));

  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const start = (page - 1) * limit;
  return {
    data: markets.slice(start, start + limit).map((market) => ({ kind: 'market', market })),
    hasNextPage: start + limit < markets.length,
    total: markets.length,
  };
}
