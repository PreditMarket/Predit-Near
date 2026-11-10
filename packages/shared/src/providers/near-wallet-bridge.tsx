'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';

import { useNearWallet } from '@/store/near-wallet.store';

/** Restores the wallet session and tops up a new account's gas. */
export function NearWalletBridge() {
  const accountId = useNearWallet((s) => s.accountId);
  const hydrate = useNearWallet((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // New accounts get a little testnet NEAR, so their first signature can pay gas.
  useEffect(() => {
    if (!accountId || sessionStorage.getItem(`onboarded:${accountId}`)) return;
    sessionStorage.setItem(`onboarded:${accountId}`, '1');
    void fetch('/api/onboard', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accountId }),
    })
      .then((res) => res.json() as Promise<{ funded?: boolean; amount?: string }>)
      .then((body) => {
        if (body.funded) toast.success(`${body.amount} testnet NEAR sent to cover your gas`);
      })
      .catch(() => undefined);
  }, [accountId]);

  return null;
}
