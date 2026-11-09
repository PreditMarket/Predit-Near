import { NEAR_MARKET_CONTRACT as MARKET, NEAR_USDC_CONTRACT as USDC } from './config';
import { nearView } from './rpc';
import type { NearMarket, NearPosition, NearSide } from './types';
import { useNearWallet, type NearTxOutcome } from '@/store/near-wallet.store';

const PAGE = 100;
const ONE_YOCTO = '1';
const TGAS = '000000000000';
const GAS_TRADE = `150${TGAS}`;

export const getNearMarket = (id: string) =>
  nearView<NearMarket | null>(MARKET, 'get_market', { market_id: id });

/** Every market, oldest first. The list is small enough to read whole. */
export async function getAllNearMarkets(): Promise<NearMarket[]> {
  const markets: NearMarket[] = [];
  for (let from = 0; ; from += PAGE) {
    const page = await nearView<NearMarket[]>(MARKET, 'get_markets', {
      from: String(from),
      limit: PAGE,
    });
    markets.push(...page);
    if (page.length < PAGE) return markets;
  }
}

export const getNearPosition = (id: string, accountId: string) =>
  nearView<NearPosition>(MARKET, 'get_position', { market_id: id, account_id: accountId });

export async function getNearUserMarkets(accountId: string) {
  const rows: [NearMarket, NearPosition][] = [];
  for (let from = 0; ; from += PAGE) {
    const page = await nearView<[NearMarket, NearPosition][]>(MARKET, 'get_user_markets', {
      account_id: accountId,
      from,
      limit: PAGE,
    });
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

export const getNearClaimable = async (accountId: string) =>
  BigInt(await nearView<string>(MARKET, 'get_claimable', { account_id: accountId }));

export const getNearUsdcBalance = async (accountId: string) =>
  BigInt(await nearView<string>(USDC, 'ft_balance_of', { account_id: accountId }));

export const getNearPaused = () => nearView<boolean>(MARKET, 'is_paused');

const txHash = (outcome: NearTxOutcome) =>
  outcome.transaction?.hash ?? outcome.transaction_outcome?.id ?? '';

/** What the transaction returned, or throws if it failed. */
function resultOf(outcome: NearTxOutcome): string {
  const { status } = outcome;
  if (status && typeof status === 'object' && 'Failure' in status && status.Failure) {
    throw new Error(failureMessage(status.Failure));
  }
  const value = status && typeof status === 'object' ? status.SuccessValue : undefined;
  return value ? atob(value) : '';
}

function failureMessage(failure: unknown): string {
  const text = JSON.stringify(failure);
  const panic = text.match(/Smart contract panicked: ([^"\\]+)/);
  return panic?.[1] ?? 'The transaction failed';
}

const sendToMarket = (methodName: string, args: Record<string, unknown>, gas = GAS_TRADE) =>
  useNearWallet.getState().send({
    receiverId: MARKET,
    methodName,
    args,
    gas,
    deposit: ONE_YOCTO,
  });

/**
 * A bet that the contract refuses still "succeeds" as a transaction: the token
 * calls the market, the market panics and the token refunds. The token returns
 * how much it kept, so zero means the bet did not happen.
 */
export async function buyOnNear(
  marketId: string,
  side: NearSide,
  amount: bigint,
  minShares: bigint,
): Promise<string> {
  const outcome = await useNearWallet.getState().send({
    receiverId: USDC,
    methodName: 'ft_transfer_call',
    args: {
      receiver_id: MARKET,
      amount: amount.toString(),
      msg: JSON.stringify({
        action: 'buy',
        market_id: marketId,
        side,
        min_shares: minShares.toString(),
      }),
    },
    gas: GAS_TRADE,
    deposit: ONE_YOCTO,
  });
  const used = resultOf(outcome).replace(/"/g, '');
  if (used === '0') throw new Error('The bet was refused and your USDC was returned');
  return txHash(outcome);
}

/** Shared by every payout: the tokens may land later as a claimable balance. */
async function payout(methodName: string, args: Record<string, unknown>): Promise<string> {
  const outcome = await sendToMarket(methodName, args);
  if (resultOf(outcome) === 'false') {
    throw new Error('Your USDC could not be delivered. It is waiting for you to withdraw.');
  }
  return txHash(outcome);
}

export const sellOnNear = (marketId: string, side: NearSide, shares: bigint, minOut: bigint) =>
  payout('sell', {
    market_id: marketId,
    side,
    shares: shares.toString(),
    min_out: minOut.toString(),
  });

export const redeemOnNear = (marketId: string) => payout('redeem', { market_id: marketId });
export const refundOnNear = (marketId: string) => payout('refund', { market_id: marketId });
export const withdrawOnNear = () => payout('withdraw', {});
