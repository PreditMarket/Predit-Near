'use client';

import { useQuery } from '@tanstack/react-query';

import { fetchConfig, type PammConfig } from '@/lib/pamm/accounts';
import { deriveConfigPda } from '@/lib/pamm/pdas';
import { usePammProgram } from './use-pamm-program';

/**
 * Fetches the singleton pm-AMM Config account.
 * Returns null when the config has not been initialized yet.
 */
export function useConfig(): { data: PammConfig | null | undefined; isLoading: boolean } {
  const program = usePammProgram();
  const [configPda] = deriveConfigPda();

  return useQuery({
    queryKey: ['pamm', 'config'],
    queryFn: () => fetchConfig(program!, configPda),
    enabled: !!program,
    // The Config account is a session-stable singleton (global fees/authority),
    // so fetch it once and reuse — no need to re-hit RPC every 30s per market.
    staleTime: 10 * 60_000,
    gcTime: 10 * 60_000,
  });
}
