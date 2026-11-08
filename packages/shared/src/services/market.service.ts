import apiClient from '@/lib/axios';
import type { PublicResolution } from '@/types/resolution';
import { queryClient } from '@/lib/query-client';
import { ME_QUERY_KEY } from './auth.queries';
import { OracleEntity } from './oracles.service';
import { Category } from './categories.service';

export interface Market {
  id: string;
  chatId: string;
  slug?: string;
  shortCode?: string;
  question: string;
  description?: string;
  status: 'open' | 'end' | 'resolved' | 'cancelled' | 'pending_approval';
  imageUrl?: string;
  image?: {
    id: string;
    path?: string;
  };
  yesPool: number;
  noPool: number;
  totalOrders: number;
  totalParticipants?: number;
  closeAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  outcome?: 'yes' | 'no';
  oracle: OracleEntity;
  isOrdered?: boolean;
  createdAt?: string;
  updatedAt?: string;
  isMessaged?: boolean;
  marketType?: 'STANDARD' | 'SOCIAL_X';
  tweetUrl?: string;
  createdBy?: string;
  submittedByUserId?: string | null;
  createdById?: string | null;
  suggestedOutcome?: 'YES' | 'NO' | null;
  suggestionConfidence?: number | null;
  suggestionReasoning?: string | null;
  suggestId?: string | null;
  isBetted?: boolean;
  selectedAiModels?: string[] | null;
  rules?: MarketRules | null;
  category?: Category | null;
  /** Parent group this market belongs to, if any (multi-candidate events). */
  groupId?: string | null;
  /** Display label of this market as an option within its group (e.g. "Trump"). */
  groupOptionLabel?: string | null;
}

export interface OutcomeRule {
  rule: string;
  /** 0 = YES, 1 = NO. */
  outcomeIndex: number;
  /** Optional custom display label for this outcome (e.g. "Over", "Trump"). */
  label?: string;
  /** Optional accent color for this outcome. */
  color?: string;
}

export interface MarketRules {
  description?: string;
  outcomeRules?: OutcomeRule[];
}

export interface MarketOrder {
  id: string;
  marketId: string;
  userId: string;
  prediction: 'yes' | 'no';
  amount: number;
  payout: number;
  market: Market;
  status: 'lost' | 'won' | 'active' | 'refunded';
  createdAt?: string;
  updatedAt?: string;
}

export interface QueryMarketParams {
  status?: string;
  oracleId?: string;
  page?: number;
  limit?: number;
  search?: string;
  sort?: string;
  order?: string;
  minVolume?: number;
  maxVolume?: number;
  categoryId?: string;
}

export interface PlaceOrderDto {
  prediction: 'yes' | 'no';
  amount: number;
}

export interface InfinityPaginationResponse<T> {
  data: T[];
  hasNextPage: boolean;
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export const LIST_MARKET_KEY = (params?: QueryMarketParams) =>
  ['market', 'list', params ?? {}] as const;

export const getListMarket = async (params?: QueryMarketParams) => {
  // Route through the shared React Query cache so concurrent and
  // short-window sequential callers (Strict-Mode double-mount,
  // useEffect refire on debounce flush, multiple components
  // reading the same filter) collapse into a single network hit.
  return queryClient.fetchQuery({
    queryKey: LIST_MARKET_KEY(params),
    queryFn: async () => {
      const response = await apiClient.get<InfinityPaginationResponse<Market>>(
        '/market',
        { params },
      );
      return response.data;
    },
    staleTime: 10_000,
  });
};

export const getMarketById = async (id: string) => {
  const response = await apiClient.get<Market>(`/market/${id}`);
  return response.data;
};

export const getMarketResolution = async (
  id: string,
): Promise<PublicResolution | null> => {
  const response = await apiClient.get<PublicResolution | null>(
    `/market/${id}/resolution`,
  );
  return response.data;
};

export const placeOrder = async (marketId: string, order: PlaceOrderDto) => {
  const response = await apiClient.post<MarketOrder>(
    `/market/${marketId}/bet`,
    order,
  );

  queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
  return response.data;
};

export const getMyOrders = async (params?: {
  page?: number;
  limit?: number;
  marketId?: string;
}) => {
  const response = await apiClient.get<InfinityPaginationResponse<MarketOrder>>(
    '/market/my/bets',
    { params },
  );
  return response.data;
};
