import type { Page } from '@playwright/test';
import { accountWithKey, send, signerFor, signNep413, type FunctionCall } from './near';

export type WalletMode = 'dry' | 'live';

/**
 * A wallet near-connect picks up like any injected one. In `dry` mode it
 * records each transaction and refuses it, so nothing reaches the chain; in
 * `live` mode it signs with the account's local testnet key.
 */
export async function injectWallet(
  page: Page,
  accountId: string,
  {
    mode = 'dry',
    connected = true,
    answer,
    name = 'E2E Wallet',
    privateKey,
  }: {
    mode?: WalletMode;
    connected?: boolean;
    /** Dry mode: a transaction outcome to hand back instead of refusing, e.g. a contract's return value. */
    answer?: (calls: FunctionCall[]) => unknown;
    /** What the wallet selector shows. */
    name?: string;
    /** Live mode with this key instead of one from ~/.near-credentials. */
    privateKey?: string;
  } = {},
): Promise<FunctionCall[]> {
  const calls: FunctionCall[] = [];
  const signer = mode !== 'live' ? null : privateKey ? accountWithKey(accountId, privateKey) : await signerFor(accountId);

  await page.exposeFunction('__e2eSign', async (tx: { receiverId: string; actions: { params?: Record<string, unknown> }[] }) => {
    const batch: FunctionCall[] = tx.actions.map((raw) => {
      const action = (raw.params ?? raw) as { methodName: string; args: unknown; gas: unknown; deposit: unknown };
      return {
        receiverId: tx.receiverId,
        methodName: action.methodName,
        args: (typeof action.args === 'string' ? JSON.parse(action.args) : action.args) as Record<string, unknown>,
        gas: String(action.gas),
        deposit: String(action.deposit),
      };
    });
    calls.push(...batch);
    if (!signer && answer) return answer(batch);
    if (!signer) throw new Error('Rejected by the test wallet');
    let last: unknown;
    for (const call of batch) last = await send(signer, call);
    return JSON.parse(JSON.stringify(last));
  });

  await page.exposeFunction('__e2eSignMessage', async (message: string, nonce: number[], recipient: string) => {
    if (!signer) throw new Error('Rejected by the test wallet');
    return signNep413(accountId, message, Uint8Array.from(nonce), recipient);
  });

  await page.addInitScript(
    ({ account, startConnected, walletName }) => {
      const key = 'e2e-wallet-on';
      if (startConnected && !sessionStorage.getItem('e2e-wallet-init')) {
        sessionStorage.setItem('e2e-wallet-init', '1');
        localStorage.setItem(key, '1');
        localStorage.setItem('selected-wallet', 'e2e-wallet');
      }
      const accounts = () => (localStorage.getItem(key) ? [{ accountId: account, publicKey: 'ed25519:11111111111111111111111111111111' }] : []);
      const wallet = {
        manifest: {
          id: 'e2e-wallet',
          name: walletName,
          icon: '',
          website: 'https://example.com',
          description: '',
          version: '1.0.0',
          type: 'injected',
          platform: [],
          permissions: {},
          features: { signAndSendTransaction: true, signMessage: true, testnet: true },
        },
        signIn: async () => {
          localStorage.setItem(key, '1');
          return accounts();
        },
        signOut: async () => localStorage.removeItem(key),
        getAccounts: async () => accounts(),
        signAndSendTransaction: (tx: unknown) => (window as unknown as { __e2eSign: (t: unknown) => Promise<unknown> }).__e2eSign(tx),
        signAndSendTransactions: async () => {
          throw new Error('Not used by the app');
        },
        signMessage: (params: { message: string; nonce: Uint8Array; recipient: string }) =>
          (window as unknown as { __e2eSignMessage: (m: string, n: number[], r: string) => Promise<unknown> }).__e2eSignMessage(
            params.message,
            Array.from(params.nonce),
            params.recipient,
          ),
      };
      window.addEventListener('near-selector-ready', () =>
        window.dispatchEvent(new CustomEvent('near-wallet-injected', { detail: wallet })),
      );
    },
    { account: accountId, startConnected: connected, walletName: name },
  );
  return calls;
}
