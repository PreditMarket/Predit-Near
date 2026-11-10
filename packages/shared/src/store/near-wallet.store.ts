'use client';

import { create } from 'zustand';
import type { NearConnector } from '@hot-labs/near-connect';
import { NEAR_NETWORK } from '@/lib/near/config';

export interface NearFunctionCall {
  receiverId: string;
  methodName: string;
  args: Record<string, unknown>;
  gas: string;
  deposit: string;
}

export interface NearTxOutcome {
  transaction?: { hash?: string };
  transaction_outcome?: { id?: string };
  status?: { SuccessValue?: string; Failure?: unknown } | string;
}

export interface SignedNearMessage {
  accountId: string;
  publicKey: string;
  signature: string;
}

type WalletStatus = 'loading' | 'connected' | 'disconnected';

interface NearWalletState {
  accountId: string | null;
  status: WalletStatus;
  hydrate: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  send: (call: NearFunctionCall) => Promise<NearTxOutcome>;
  /** Several calls to one contract, signed and sent as one transaction. */
  sendAll: (receiverId: string, calls: Omit<NearFunctionCall, 'receiverId'>[]) => Promise<NearTxOutcome>;
  signMessage: (params: { message: string; recipient: string; nonce: Uint8Array }) => Promise<SignedNearMessage>;
}

let connector: Promise<NearConnector> | null = null;

/** Created on first use: the connector only works in a browser. */
const getConnector = () => {
  connector ??= import('@hot-labs/near-connect').then(({ NearConnector }) => {
    const instance = new NearConnector({
      network: NEAR_NETWORK,
      features:
        NEAR_NETWORK === 'testnet'
          ? { signAndSendTransaction: true, testnet: true }
          : { signAndSendTransaction: true, mainnet: true },
    });
    instance.on('wallet:signIn', (event: { accounts: { accountId: string }[] }) => {
      setAccount(event.accounts[0]?.accountId ?? null);
    });
    instance.on('wallet:signOut', () => setAccount(null));
    return instance;
  });
  return connector;
};

/** The account is the session: there is no backend login. */
function setAccount(accountId: string | null) {
  useNearWallet.setState({ accountId, status: accountId ? 'connected' : 'disconnected' });
}

export const useNearWallet = create<NearWalletState>((_, get) => ({
  accountId: null,
  status: 'loading',

  async hydrate() {
    try {
      const nearConnector = await getConnector();
      const { accounts } = await nearConnector.getConnectedWallet();
      setAccount(accounts[0]?.accountId ?? null);
    } catch {
      // Nothing connected yet.
      setAccount(null);
    }
  },

  async connect() {
    const nearConnector = await getConnector();
    await nearConnector.connect();
  },

  async disconnect() {
    const nearConnector = await getConnector();
    await nearConnector.disconnect();
    setAccount(null);
  },

  send({ receiverId, ...call }) {
    return get().sendAll(receiverId, [call]);
  },

  async sendAll(receiverId, calls) {
    const signerId = get().accountId;
    if (!signerId) throw new Error('Connect a NEAR wallet first');
    const nearConnector = await getConnector();
    const wallet = await nearConnector.wallet();
    const outcome = await wallet.signAndSendTransaction({
      network: NEAR_NETWORK,
      signerId,
      receiverId,
      actions: calls.map(({ methodName, args, gas, deposit }) => ({
        type: 'FunctionCall',
        params: { methodName, args, gas, deposit },
      })),
    });
    return outcome as NearTxOutcome;
  },

  async signMessage({ message, recipient, nonce }) {
    const signerId = get().accountId;
    if (!signerId) throw new Error('Connect a NEAR wallet first');
    const nearConnector = await getConnector();
    const wallet = await nearConnector.wallet();
    return wallet.signMessage({ network: NEAR_NETWORK, signerId, message, recipient, nonce });
  },
}));
