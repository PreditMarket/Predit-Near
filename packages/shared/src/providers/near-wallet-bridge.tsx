'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';

import { useAppShellStore } from '@/store/app-shell-store';
import { useNearWallet } from '@/store/near-wallet.store';
import { useV2AuthStore } from '@/store/v2-auth-store';

/** Restores the wallet session and answers every "please sign in" prompt with the wallet. */
export function NearWalletBridge() {
  const accountId = useNearWallet((s) => s.accountId);
  const hydrate = useNearWallet((s) => s.hydrate);
  const connect = useNearWallet((s) => s.connect);
  const walletPrompt = useAppShellStore((s) => s.walletConnectOpen);
  const signInPrompt = useV2AuthStore((s) => s.signInOpen);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!walletPrompt && !signInPrompt) return;
    useAppShellStore.getState().setOpen('walletConnectOpen', false);
    useV2AuthStore.getState().setSignInOpen(false);
    void connect();
  }, [walletPrompt, signInPrompt, connect]);

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
