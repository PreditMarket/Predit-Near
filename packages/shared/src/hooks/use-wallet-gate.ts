'use client';

import { useNearWallet } from '@/store/near-wallet.store';

export interface WalletGate {
  walletReady: boolean;
  /** Not ready yet, and nothing for the user to do but wait — disable the CTA. */
  connecting: boolean;
  handleAction: (onReady: () => void) => () => void;
  getCtaLabel: (readyLabel: string, isPending?: boolean) => string;
}

/** One gate for every on-chain button: connect the NEAR wallet, then act. */
export function useWalletGate(): WalletGate {
  const accountId = useNearWallet((s) => s.accountId);
  const status = useNearWallet((s) => s.status);
  const connect = useNearWallet((s) => s.connect);

  const walletReady = status === 'connected' && !!accountId;
  const connecting = status === 'loading';

  const handleAction = (onReady: () => void) => () => {
    if (walletReady) onReady();
    else if (!connecting) void connect();
  };

  const getCtaLabel = (readyLabel: string, isPending = false): string => {
    if (isPending) return 'Confirming…';
    if (connecting) return 'Connecting wallet…';
    return walletReady ? readyLabel : 'Connect wallet';
  };

  return {
    walletReady,
    connecting,
    handleAction,
    getCtaLabel,
  };
}
