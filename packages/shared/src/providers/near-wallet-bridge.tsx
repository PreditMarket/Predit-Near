'use client';

import { useEffect } from 'react';

import { useAppShellStore } from '@/store/app-shell-store';
import { useNearWallet } from '@/store/near-wallet.store';
import { useV2AuthStore } from '@/store/v2-auth-store';

/** Restores the wallet session and answers every "please sign in" prompt with the wallet. */
export function NearWalletBridge() {
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

  return null;
}
