'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/auth.store';
import { useV2AuthStore } from '@/store/v2-auth-store';
import { useLinkWallet } from '@/hooks/use-link-wallet';

export interface WalletGate {
  walletReady: boolean;
  signedIn: boolean;
  /** Not ready yet, and nothing for the user to do but wait — disable the CTA. */
  connecting: boolean;
  /** The account's Solana wallet, when known. */
  walletAddress: string | null;
  handleAction: (onReady: () => void) => () => void;
  getCtaLabel: (readyLabel: string, isPending?: boolean) => string;
}

/**
 * One-stop gate for any onchain action button (trade, redeem, add/withdraw
 * LP, etc), so every CTA across the app behaves identically.
 *
 * Callers wire it via `handleAction` for onClick and `getCtaLabel` for the
 * button text, and disable the button on `connecting` while it isn't ready.
 *
 * Two sign-ins reach this shared code: the web app's (V2, Privy) and the
 * admin app's (V1, external wallet) — see {@link useV2WalletGate} and
 * {@link useV1WalletGate}. Only the admin app ever holds a V1 token.
 */
export function useWalletGate(): WalletGate {
  const v1Session = useAuthStore((s) => !!s.accessToken);
  const v2 = useV2WalletGate();
  const v1 = useV1WalletGate();
  return v1Session ? v1 : v2;
}

/**
 * Web app. The site signs in with Privy only, and the account's Solana wallet
 * is the Privy-embedded one BE provisioned at sign-in — there is no wallet to
 * pick or link. So the gate has three states:
 *
 *   1. Signed out → "Sign in" → opens the site-wide sign-in.
 *   2. Signed in (or restoring the session), the embedded wallet not
 *      attached yet → "Connecting wallet…", disabled (PrivySolanaBridge
 *      attaches it on its own).
 *   3. Ready → caller's ready label (e.g., "Buy").
 */
function useV2WalletGate(): WalletGate {
  const { connected, publicKey } = useWallet();
  const status = useV2AuthStore((s) => s.status);
  const setSignInOpen = useV2AuthStore((s) => s.setSignInOpen);
  const accountWallet = useAuthStore((s) => s.user?.solanaWallet);

  const signedIn = status === 'authenticated';
  const connectedAddr = publicKey?.toBase58() ?? null;
  const walletReady =
    signedIn && connected && !!accountWallet && connectedAddr === accountWallet;
  const connecting = !walletReady && status !== 'anonymous';

  const handleAction = (onReady: () => void) => () => {
    if (status === 'anonymous') {
      setSignInOpen(true);
      return;
    }
    if (!walletReady) return;
    onReady();
  };

  const getCtaLabel = (readyLabel: string, isPending = false): string => {
    if (isPending) return 'Confirming…';
    if (status === 'anonymous') return 'Sign in';
    if (!walletReady) return 'Connecting wallet…';
    return readyLabel;
  };

  return {
    walletReady,
    signedIn,
    connecting,
    walletAddress: accountWallet ?? null,
    handleAction,
    getCtaLabel,
  };
}

/**
 * Admin app (V1 sign-in): the admin signs with an external wallet linked to
 * their account.
 *
 *   1. Not connected, never linked → "Connect & Link Wallet"
 *      → opens modal + auto-links after connect; if sign fails,
 *        disconnect so the admin can retry from scratch in one click.
 *   2. Not connected, has linked → "Connect Wallet".
 *   3. Connected, mismatch with linked → "Wrong Wallet — Click to Switch"
 *      → toast + disconnect so the admin reconnects with the linked wallet.
 *   4. Connected, no link yet → "Link This Wallet" (retry path).
 *   5. Connected, linked, matched → caller's ready label.
 */
function useV1WalletGate(): WalletGate {
  const { connected, publicKey, disconnect } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();
  const linkedWallet = useAuthStore((s) => s.user?.solanaWallet);
  const { linkWallet, linking } = useLinkWallet();
  const [pendingLink, setPendingLink] = useState(false);

  useEffect(() => {
    if (pendingLink && connected && publicKey) {
      setPendingLink(false);
      void linkWallet().then((ok) => {
        if (!ok) void disconnect();
      });
    }
  }, [pendingLink, connected, publicKey, linkWallet, disconnect]);

  const connectedAddr = publicKey?.toBase58() ?? null;
  const walletMismatch = !!(
    linkedWallet &&
    connected &&
    connectedAddr &&
    connectedAddr !== linkedWallet
  );
  const needsLink = connected && !linkedWallet;
  const walletReady =
    connected && !!linkedWallet && connectedAddr === linkedWallet;

  const handleAction = (onReady: () => void) => () => {
    if (!connected) {
      // Never linked → arm auto-link so connect + sign happens in one click.
      if (!linkedWallet) setPendingLink(true);
      setWalletModalVisible(true);
      return;
    }
    if (walletMismatch) {
      toast.error(
        `Please switch to your linked wallet: ${linkedWallet!.slice(0, 6)}…${linkedWallet!.slice(-6)}`,
      );
      void disconnect();
      setWalletModalVisible(true);
      return;
    }
    if (needsLink) {
      void linkWallet().then((ok) => {
        if (!ok) void disconnect();
      });
      return;
    }
    onReady();
  };

  const getCtaLabel = (readyLabel: string, isPending = false): string => {
    if (isPending) return 'Confirming…';
    if (linking) return 'Linking…';
    if (!connected) {
      return linkedWallet ? 'Connect Wallet' : 'Connect & Link Wallet';
    }
    if (walletMismatch) return 'Wrong Wallet — Click to Switch';
    if (needsLink) return 'Link This Wallet';
    return readyLabel;
  };

  return {
    walletReady,
    signedIn: true,
    connecting: linking,
    walletAddress: linkedWallet ?? null,
    handleAction,
    getCtaLabel,
  };
}
