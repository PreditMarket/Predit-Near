export const SIMULATED_CHAINS = [
  { id: 'base', name: 'Base' },
  { id: 'arbitrum', name: 'Arbitrum' },
  { id: 'solana', name: 'Solana' },
  { id: 'bnb', name: 'BNB Chain' },
] as const;

export type SimulatedChain = (typeof SIMULATED_CHAINS)[number]['id'];
