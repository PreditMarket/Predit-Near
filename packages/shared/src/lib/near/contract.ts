import { NEAR_MARKET_CONTRACT as MARKET, NEAR_USDC_CONTRACT as USDC } from './config';
import { nearView } from './rpc';
import type { NearClaim, NearForecastRecord, NearMarket, NearPosition, NearPost, NearRules, NearSide } from './types';
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

/** Every payout the account took, by market id. */
export async function getNearUserClaims(accountId: string): Promise<Map<string, NearClaim>> {
  const rows = await nearView<[string, NearClaim][]>(MARKET, 'get_user_claims', { account_id: accountId });
  return new Map(rows);
}

export const getNearClaimable = async (accountId: string) =>
  BigInt(await nearView<string>(MARKET, 'get_claimable', { account_id: accountId }));

export const getNearUsdcBalance = async (accountId: string) =>
  BigInt(await nearView<string>(USDC, 'ft_balance_of', { account_id: accountId }));

/** Sends tUSDC from the connected account, registering the receiver with the token first if needed. */
export async function transferUsdcOnNear(receiverId: string, amount: bigint, memo?: string): Promise<string> {
  const registered = await nearView<unknown>(USDC, 'storage_balance_of', { account_id: receiverId });
  const calls = [];
  if (!registered) {
    const { min } = await nearView<{ min: string }>(USDC, 'storage_balance_bounds');
    calls.push({
      methodName: 'storage_deposit',
      args: { account_id: receiverId, registration_only: true },
      gas: `30${TGAS}`,
      deposit: min,
    });
  }
  calls.push({
    methodName: 'ft_transfer',
    args: { receiver_id: receiverId, amount: amount.toString(), ...(memo ? { memo } : {}) },
    gas: `30${TGAS}`,
    deposit: ONE_YOCTO,
  });
  const outcome = await useNearWallet.getState().sendAll(USDC, calls);
  resultOf(outcome);
  return txHash(outcome);
}

export const getNearRecord = (authorRef: string) =>
  nearView<NearForecastRecord>(MARKET, 'get_record', { author_ref: authorRef });

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
 * A buy that the contract refuses still "succeeds" as a transaction: the token
 * calls the market, the market panics and the token refunds. The token returns
 * how much it kept, so zero means the buy did not happen.
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
  if (used === '0') throw new Error('The order was refused and your USDC was returned');
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

/** The markets created from each post. The contract answers 100 posts per call. */
export async function getNearMarketsForPosts(postIds: string[]): Promise<Map<string, NearMarket[]>> {
  const chunks: string[][] = [];
  for (let i = 0; i < postIds.length; i += 100) chunks.push(postIds.slice(i, i + 100));
  const answers = await Promise.all(
    chunks.map((post_ids) =>
      nearView<[string, NearMarket[]][]>(MARKET, 'get_markets_for_posts', { post_ids }),
    ),
  );
  return new Map(answers.flat());
}

/** When the account may use the faucet again, in milliseconds. */
export async function getNearFaucetReadyAt(accountId: string): Promise<number> {
  return Number(await nearView<string>(USDC, 'faucet_ready_at', { account_id: accountId }));
}

export async function claimNearFaucet(): Promise<string> {
  const outcome = await useNearWallet.getState().send({
    receiverId: USDC,
    methodName: 'faucet',
    args: {},
    gas: `50${TGAS}`,
    deposit: '0',
  });
  resultOf(outcome);
  return txHash(outcome);
}

/** Over the bond, to cover storage. The contract refunds what it does not use. */
export const CREATE_MARKET_MARGIN = BigInt(10) ** BigInt(23); // 0.1 NEAR

export const getNearCreationBond = async () =>
  BigInt((await nearView<{ creation_bond: string }>(MARKET, 'get_config', {})).creation_bond);

export const getNearChallengeBond = async () =>
  BigInt((await nearView<{ challenge_bond: string }>(MARKET, 'get_config', {})).challenge_bond);

/** Disputes a posted result. The bond is lost if the arbiter upholds the result. */
export async function challengeOnNear(marketId: string, reason: string, bond: bigint): Promise<void> {
  const outcome = await useNearWallet.getState().send({
    receiverId: MARKET,
    methodName: 'challenge',
    args: { market_id: marketId, reason_uri: reason },
    gas: `100${TGAS}`,
    deposit: bond.toString(),
  });
  resultOf(outcome);
}

export interface NearCreateMarketArgs {
  post: NearPost;
  claim_side: NearSide;
  rules: NearRules;
  draft: { model: string; chat_id: string };
}

/** One transaction: locks the rules and places the bond. */
export async function createMarketOnNear(
  args: NearCreateMarketArgs,
  bond: bigint,
): Promise<{ marketId: string; hash: string }> {
  const outcome = await useNearWallet.getState().send({
    receiverId: MARKET,
    methodName: 'create_market',
    args: { ...args },
    gas: `100${TGAS}`,
    deposit: (bond + CREATE_MARKET_MARGIN).toString(),
  });
  return { marketId: resultOf(outcome).replace(/"/g, ''), hash: txHash(outcome) };
}

