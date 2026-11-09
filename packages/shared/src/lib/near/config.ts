export type NearNetwork = 'testnet' | 'mainnet';

export const NEAR_NETWORK: NearNetwork =
  process.env.NEXT_PUBLIC_NEAR_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';

export const NEAR_MARKET_CONTRACT =
  process.env.NEXT_PUBLIC_NEAR_MARKET_CONTRACT ?? 'predit-markets-market.testnet';

export const NEAR_USDC_CONTRACT =
  process.env.NEXT_PUBLIC_NEAR_USDC_CONTRACT ?? 'predit-markets-usdc.testnet';

export const NEAR_RPC_URLS =
  NEAR_NETWORK === 'mainnet'
    ? ['https://free.rpc.fastnear.com', 'https://rpc.mainnet.near.org']
    : ['https://test.rpc.fastnear.com', 'https://rpc.testnet.near.org'];

export const USDC_DECIMALS = 6;
export const USDC_SYMBOL = NEAR_NETWORK === 'mainnet' ? 'USDC' : 'tUSDC';

export const nearExplorerTxUrl = (hash: string) =>
  `https://${NEAR_NETWORK === 'mainnet' ? '' : 'testnet.'}nearblocks.io/txns/${hash}`;

export const nearExplorerAccountUrl = (account: string) =>
  `https://${NEAR_NETWORK === 'mainnet' ? '' : 'testnet.'}nearblocks.io/address/${account}`;
