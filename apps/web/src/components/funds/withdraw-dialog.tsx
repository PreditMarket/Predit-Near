'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SegmentedTabs } from '@/components/v2';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useNearFunds } from '@/hooks/pamm/use-near-funds';
import { NEAR_USDC_CONTRACT, nearExplorerTxUrl, USDC_DECIMALS, USDC_SYMBOL } from '@/lib/near/config';
import { transferUsdcOnNear, withdrawOnNear } from '@/lib/near/contract';
import { getNearNativeBalance } from '@/lib/near/rpc';
import { SIMULATED_CHAINS, type SimulatedChain } from '@/lib/near/simulated-deposit';
import { useNearWallet } from '@/store/near-wallet.store';
import { formatUsdc } from './balance-menu';
import { Balances, STAT_LABEL } from './deposit-dialog';
import { refreshFunds } from './refresh-funds';

type Tab = 'near' | 'other';
type SimStep = 'idle' | 'SENT_ON_NEAR' | 'BRIDGING' | 'COMPLETE' | 'FAILED';

const TABS = [
  { value: 'near' as const, label: 'NEAR' },
  { value: 'other' as const, label: 'Other chains' },
];
const SIM_STEPS: SimStep[] = ['SENT_ON_NEAR', 'BRIDGING', 'COMPLETE'];
const INPUT = 'h-9 w-full rounded-md border border-border bg-background px-3 font-mono text-[13px] outline-none focus:border-primary';
const NEAR_ACCOUNT = /^(?=.{2,64}$)[a-z0-9]+([-_][a-z0-9]+)*(\.[a-z0-9]+([-_][a-z0-9]+)*)*$/;
const UNIT = 10 ** USDC_DECIMALS;

/** The address format each simulated chain takes. Nothing is sent there. */
const ADDRESS: Record<SimulatedChain, RegExp> = {
  base: /^0x[0-9a-fA-F]{40}$/,
  arbitrum: /^0x[0-9a-fA-F]{40}$/,
  bnb: /^0x[0-9a-fA-F]{40}$/,
  solana: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
};

/** Whole tUSDC units, or null when the text is not an amount up to `max`. */
function parseAmount(text: string, max: bigint | undefined): bigint | null {
  if (!/^\d+(\.\d{0,6})?$/.test(text.trim())) return null;
  const units = BigInt(Math.round(Number(text) * UNIT));
  if (units <= BigInt(0) || (max !== undefined && units > max)) return null;
  return units;
}

function AmountField({ value, onChange, max }: { value: string; onChange: (v: string) => void; max: bigint | undefined }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center justify-between">
        <span className={STAT_LABEL}>Amount ({USDC_SYMBOL})</span>
        {max !== undefined && (
          <button type="button" className="font-mono text-[11px] text-primary hover:underline" onClick={() => onChange(String(Number(max) / UNIT))}>
            Max
          </button>
        )}
      </span>
      <input data-testid="withdraw-amount" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} className={INPUT} />
    </label>
  );
}

function ClaimableRow() {
  const queryClient = useQueryClient();
  const { data: funds } = useNearFunds();
  const [busy, setBusy] = useState(false);
  const claimable = funds?.claimable ?? BigInt(0);
  if (claimable <= BigInt(0)) return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/40 px-3 py-2 text-[12.5px]">
      <span>
        <span className={STAT_LABEL}>To collect</span>
        <span className="block font-mono">
          {formatUsdc(claimable)} {USDC_SYMBOL} held by the market contract
        </span>
      </span>
      <Button
        size="sm"
        data-testid="withdraw-claimable"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await withdrawOnNear();
            toast.success('Moved to your wallet');
            refreshFunds(queryClient);
          } catch (err) {
            toast.error((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Confirming…' : 'Move to wallet'}
      </Button>
    </div>
  );
}

function NearTab({ accountId }: { accountId: string }) {
  const queryClient = useQueryClient();
  const { data: funds } = useNearFunds();
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const receiver = to.trim().toLowerCase();
  const units = parseAmount(amount, funds?.usdc);
  const problem = !NEAR_ACCOUNT.test(receiver)
    ? 'Enter a NEAR account, for example alice.testnet.'
    : receiver === accountId
      ? 'That is this account.'
      : units === null
        ? `Enter an amount up to your ${USDC_SYMBOL} balance.`
        : null;

  const send = async () => {
    if (problem || units === null) return;
    setBusy(true);
    setError(null);
    setSent(null);
    try {
      if ((await getNearNativeBalance(receiver)) === null) throw new Error(`${receiver} does not exist on NEAR testnet.`);
      setSent(await transferUsdcOnNear(receiver, units));
      setAmount('');
      refreshFunds(queryClient);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Balances accountId={accountId} />
      <ClaimableRow />
      <label className="flex flex-col gap-1">
        <span className={STAT_LABEL}>To NEAR account</span>
        <input data-testid="withdraw-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="alice.testnet" className={INPUT} />
      </label>
      <AmountField value={amount} onChange={setAmount} max={funds?.usdc} />
      {to && amount && problem && <p data-testid="withdraw-problem" className="text-[12px] text-muted-foreground">{problem}</p>}
      {error && <p data-testid="withdraw-error" className="text-[12px] text-danger">{error}</p>}
      {sent && (
        <p data-testid="withdraw-sent" className="text-[12px] text-success">
          Sent.{' '}
          <a href={nearExplorerTxUrl(sent)} target="_blank" rel="noopener noreferrer" className="underline">
            View on the explorer
          </a>
        </p>
      )}
      <Button data-testid="withdraw-send" disabled={!!problem || busy} onClick={() => void send()}>
        {busy ? 'Confirming…' : `Send ${USDC_SYMBOL}`}
      </Button>
      <p className="text-[11.5px] text-muted-foreground">
        If the account has never held {USDC_SYMBOL}, the same transaction registers it with the token (a little NEAR, paid once).
      </p>
    </div>
  );
}

function OtherChainsTab({ accountId }: { accountId: string }) {
  const queryClient = useQueryClient();
  const { data: funds } = useNearFunds();
  const [chain, setChain] = useState<SimulatedChain>('base');
  const [address, setAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<SimStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const units = parseAmount(amount, funds?.usdc);
  const running = step === 'SENT_ON_NEAR' || step === 'BRIDGING';
  const problem = !ADDRESS[chain].test(address.trim())
    ? `Enter a ${SIMULATED_CHAINS.find((c) => c.id === chain)?.name} address.`
    : units === null
      ? `Enter an amount up to your ${USDC_SYMBOL} balance.`
      : null;

  const simulate = async () => {
    if (problem || units === null) return;
    setError(null);
    setTxHash(null);
    try {
      // The tUSDC really leaves this wallet, back to the token contract; nothing arrives anywhere else.
      const hash = await transferUsdcOnNear(NEAR_USDC_CONTRACT, units, `Simulated withdrawal to ${chain}:${address.trim()}`);
      setTxHash(hash);
      setStep('SENT_ON_NEAR');
      refreshFunds(queryClient);
      await new Promise((resolve) => setTimeout(resolve, 1_200));
      setStep('BRIDGING');
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      setStep('COMPLETE');
    } catch (err) {
      setError((err as Error).message);
      setStep('FAILED');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div data-testid="withdraw-simulation-label" className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[12px] text-warning">
        <strong>Testnet simulation.</strong> The {USDC_SYMBOL} leaves your NEAR wallet for real, but nothing is sent to any other chain.
      </div>
      <div className="flex flex-wrap gap-2">
        {SIMULATED_CHAINS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setChain(c.id)}
            className={`rounded-md border px-3 py-1.5 font-mono text-[12px] ${
              chain === c.id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>
      <Balances accountId={accountId} />
      <label className="flex flex-col gap-1">
        <span className={STAT_LABEL}>To address on {SIMULATED_CHAINS.find((c) => c.id === chain)?.name}</span>
        <input
          data-testid="withdraw-address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={chain === 'solana' ? 'Solana address' : '0x…'}
          className={INPUT}
        />
      </label>
      <AmountField value={amount} onChange={setAmount} max={funds?.usdc} />
      {address && amount && problem && <p className="text-[12px] text-muted-foreground">{problem}</p>}
      <Button data-testid="withdraw-simulate" disabled={!!problem || running} onClick={() => void simulate()}>
        {running ? 'Simulating…' : 'Simulate withdrawal'}
      </Button>
      {step !== 'idle' && (
        <ol className="flex flex-col gap-1 font-mono text-[12px]" data-testid="withdraw-status">
          {SIM_STEPS.map((s) => {
            const reached = step !== 'FAILED' && SIM_STEPS.indexOf(step) >= SIM_STEPS.indexOf(s);
            return (
              <li key={s} className={reached ? 'text-success' : 'text-muted-foreground'}>
                {reached ? '●' : '○'} {s}
              </li>
            );
          })}
          {step === 'FAILED' && <li className="text-danger">● FAILED: {error}</li>}
          {txHash && (
            <li>
              <a href={nearExplorerTxUrl(txHash)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                View the NEAR side on the explorer
              </a>
            </li>
          )}
        </ol>
      )}
    </div>
  );
}

/** Moving tUSDC out: to another NEAR account for real, or a labelled simulation of another chain. */
export function WithdrawDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const accountId = useNearWallet((s) => s.accountId);
  const [tab, setTab] = useState<Tab>('near');
  return (
    <Dialog open={open && !!accountId} onOpenChange={onOpenChange}>
      <DialogContent data-testid="withdraw-dialog" className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogTitle>Withdraw</DialogTitle>
        <DialogDescription className="sr-only">Send {USDC_SYMBOL} out of your NEAR account.</DialogDescription>
        {accountId && (
          <div className="flex min-w-0 flex-col gap-4">
            <SegmentedTabs value={tab} onChange={setTab} options={TABS} data-testid="withdraw-tabs" />
            {tab === 'near' ? <NearTab accountId={accountId} /> : <OtherChainsTab accountId={accountId} />}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
