export const SIMULATED_CHAINS = [
  { id: 'base', name: 'Base' },
  { id: 'arbitrum', name: 'Arbitrum' },
  { id: 'solana', name: 'Solana' },
  { id: 'bnb', name: 'BNB Chain' },
] as const;

export type SimulatedChain = (typeof SIMULATED_CHAINS)[number]['id'];

/**
 * What the screen shows as the deposit address. Deliberately not a valid
 * address on any chain, so nobody can send real funds to it.
 */
export const simulatedAddress = (chain: SimulatedChain, accountId: string) =>
  `simulated-${chain}-deposit-for-${accountId}`;
