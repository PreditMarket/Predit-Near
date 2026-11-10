import type { QueryClient } from '@tanstack/react-query';

/**
 * Re-reads balances after a transfer. The RPC answers at "final", a couple of
 * seconds behind the transaction, so one refetch right away can still show
 * the old amount: read again shortly after.
 */
export function refreshFunds(queryClient: QueryClient) {
  const again = () => void queryClient.invalidateQueries({ queryKey: ['near'] });
  again();
  setTimeout(again, 2_500);
  setTimeout(again, 6_000);
}
