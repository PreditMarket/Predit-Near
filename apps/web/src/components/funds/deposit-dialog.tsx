'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { AddressRow } from '@/components/v2/address-row';
import { SegmentedTabs } from '@/components/v2';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useNearFunds } from '@/hooks/pamm/use-near-funds';
import { nearExplorerTxUrl, USDC_DECIMALS, USDC_SYMBOL } from '@/lib/near/config';
import { claimNearFaucet, getNearFaucetReadyAt } from '@/lib/near/contract';
import { getNearNativeBalance } from '@/lib/near/rpc';
import { SIMULATED_CHAINS, type SimulatedChain } from '@/lib/near/simulated-deposit';
import { useNearWallet } from '@/store/near-wallet.store';
import { refreshFunds } from './refresh-funds';

type Tab = 'near' | 'other';
type SimStep = 'idle' | 'PENDING_DEPOSIT' | 'PROCESSING' | 'SUCCESS' | 'FAILED';

const TABS = [
  { value: 'near' as const, label: 'NEAR' },
  { value: 'other' as const, label: 'Other chains' },
];
const SIM_STEPS: SimStep[] = ['PENDING_DEPOSIT', 'PROCESSING', 'SUCCESS'];
export const CARD = 'flex flex-col gap-4 rounded-xl border border-border bg-elevated p-4 sm:flex-row';
const STAT = 'rounded-lg border border-border bg-background/40 px-3 py-2';
export const STAT_LABEL = 'font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground';

function formatWait(ms: number) {
  const minutes = Math.ceil(ms / 60_000);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}

export function Balances({ accountId }: { accountId: string }) {
  const { data: funds } = useNearFunds();
  const { data: native } = useQuery({
    queryKey: ['near', 'balance', 'native', accountId],
    queryFn: () => getNearNativeBalance(accountId),
    refetchInterval: 15_000,
  });
  const usdc = funds ? Number(funds.usdc) / 10 ** USDC_DECIMALS : null;
  const gas = native === undefined ? null : Number(native ?? BigInt(0)) / 1e24;
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className={STAT}>
        <div className={STAT_LABEL}>{USDC_SYMBOL}</div>
        <div className="font-mono text-[15px] font-bold tabular-nums" data-testid="deposit-usdc-balance">
          {usdc === null ? '…' : usdc.toLocaleString('en-US', { maximumFractionDigits: 2 })}
        </div>
      </div>
      <div className={STAT}>
        <div className={STAT_LABEL}>NEAR for gas</div>
        <div className="font-mono text-[15px] font-bold tabular-nums">
          {gas === null ? '…' : gas.toLocaleString('en-US', { maximumFractionDigits: 3 })}
        </div>
      </div>
    </div>
  );
}

function NearTab({ accountId }: { accountId: string }) {
  const queryClient = useQueryClient();
  const { data: readyAt } = useQuery({
    queryKey: ['near', 'faucet', accountId],
    queryFn: () => getNearFaucetReadyAt(accountId),
  });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const faucet = useMutation({
    mutationFn: claimNearFaucet,
    onSuccess: () => {
      toast.success(`100 ${USDC_SYMBOL} added to your account`);
      refreshFunds(queryClient);
    },
    onError: (err: Error) => toast.error(err.message),
  });
  const wait = (readyAt ?? 0) - now;

  return (
    <div className="flex flex-col gap-4">
      <div className={CARD}>
        <div className="self-center rounded-lg bg-white p-2">
          <QRCodeSVG value={accountId} size={140} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <AddressRow label="Your NEAR account" address={accountId} full />
          <Balances accountId={accountId} />
          <p className="text-[12px] text-muted-foreground">
            Send {USDC_SYMBOL} to this account on NEAR testnet, or get some from the faucet. Your funds stay
            in your wallet until you predict.
          </p>
        </div>
      </div>
      <Button
        data-testid="deposit-faucet"
        disabled={faucet.isPending || wait > 0}
        onClick={() => faucet.mutate()}
      >
        {faucet.isPending
          ? 'Confirming…'
          : wait > 0
            ? `Faucet available in ${formatWait(wait)}`
            : `Get 100 ${USDC_SYMBOL} from the faucet`}
      </Button>
    </div>
  );
}

/** A colour per chain, for the picker's dot. */
const CHAIN_TONE: Record<SimulatedChain, string> = {
  base: '#3b82f6',
  arbitrum: '#28a0f0',
  solana: '#9b5cf6',
  bnb: '#f0b90b',
};
const AMOUNTS = [25, 50, 100];
const DEPOSIT_STEPS: { step: SimStep; label: (chain: string) => string }[] = [
  { step: 'PENDING_DEPOSIT', label: () => 'Deposit sent' },
  { step: 'PROCESSING', label: (chain) => `Confirming on ${chain}` },
  { step: 'SUCCESS', label: () => 'Credited to NEAR' },
];

function OtherChainsTab({ accountId }: { accountId: string }) {
  const queryClient = useQueryClient();
  const [chain, setChain] = useState<SimulatedChain>('base');
  const [amount, setAmount] = useState('100');
  const [step, setStep] = useState<SimStep>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const chainName = SIMULATED_CHAINS.find((c) => c.id === chain)?.name ?? chain;
  const running = step === 'PENDING_DEPOSIT' || step === 'PROCESSING';
  const value = Number(amount);
  const valid = value >= 1 && value <= 1000;

  const deposit = async () => {
    setError(null);
    setTxHash(null);
    setStep('PENDING_DEPOSIT');
    await new Promise((resolve) => setTimeout(resolve, 1200));
    setStep('PROCESSING');
    try {
      const res = await fetch('/api/deposit/simulate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accountId, chain, amount: value }),
      });
      const body = (await res.json()) as { txHash?: string; error?: string };
      if (!res.ok) throw new Error(body.error ?? 'The deposit failed');
      setTxHash(body.txHash ?? null);
      setStep('SUCCESS');
      refreshFunds(queryClient);
    } catch (err) {
      setError((err as Error).message);
      setStep('FAILED');
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {SIMULATED_CHAINS.map((c) => (
          <button
            key={c.id}
            type="button"
            data-testid={`deposit-chain-${c.id}`}
            disabled={running}
            onClick={() => setChain(c.id)}
            className={`flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px] font-semibold transition-colors ${
              chain === c.id ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CHAIN_TONE[c.id] }} />
            <span className="truncate">{c.name}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1 rounded-xl border border-border bg-elevated">
        <label className="flex flex-col gap-1.5 px-4 pt-3">
          <span className={STAT_LABEL}>From · USDC on {chainName}</span>
          <span className="flex items-center gap-2">
            <input
              data-testid="simulate-amount"
              inputMode="decimal"
              value={amount}
              disabled={running}
              onChange={(e) => setAmount(e.target.value)}
              className="min-w-0 flex-1 bg-transparent font-mono text-[26px] font-bold tabular-nums text-foreground outline-none"
            />
            <span className="font-mono text-[13px] font-semibold text-muted-foreground">USDC</span>
          </span>
        </label>
        <div className="flex gap-1.5 px-4 pb-3">
          {AMOUNTS.map((a) => (
            <button
              key={a}
              type="button"
              disabled={running}
              onClick={() => setAmount(String(a))}
              className="rounded-md border border-border px-2.5 py-1 font-mono text-[11px] text-muted-foreground hover:text-foreground"
            >
              {a}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-1 border-t border-border px-4 py-3">
          <span className={STAT_LABEL}>To · your NEAR account</span>
          <span className="flex items-center justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate font-mono">{accountId}</span>
            <span className="shrink-0 font-mono font-bold tabular-nums">
              {valid ? value.toLocaleString('en-US') : '–'} {USDC_SYMBOL}
            </span>
          </span>
          <span className="text-[11.5px] text-muted-foreground">Usually arrives in about a minute.</span>
        </div>
      </div>

      <Balances accountId={accountId} />

      <Button data-testid="simulate-deposit" disabled={running || !valid} onClick={() => void deposit()}>
        {running ? 'Depositing…' : `Deposit ${valid ? value.toLocaleString('en-US') : ''} USDC from ${chainName}`}
      </Button>

      {step !== 'idle' && (
        <ol className="grid grid-cols-3 gap-2" data-testid="simulate-status" data-step={step}>
          {DEPOSIT_STEPS.map(({ step: s, label }) => {
            const reached = step !== 'FAILED' && SIM_STEPS.indexOf(step) >= SIM_STEPS.indexOf(s);
            const current = step === s && s !== 'SUCCESS';
            return (
              <li
                key={s}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[11.5px] font-semibold ${
                  reached ? 'border-success/40 bg-success/10 text-success' : 'border-border text-muted-foreground'
                }`}
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${reached ? 'bg-success' : 'bg-muted-foreground/40'} ${current ? 'animate-pulse' : ''}`} />
                {label(chainName)}
              </li>
            );
          })}
        </ol>
      )}
      {step === 'FAILED' && <p className="text-[12px] text-danger">{error}</p>}
      {txHash && (
        <a href={nearExplorerTxUrl(txHash)} target="_blank" rel="noopener noreferrer" className="self-start text-[12px] text-primary hover:underline">
          View the credit on NEAR
        </a>
      )}
    </div>
  );
}

/** Funding: tUSDC lands in the account's own NEAR wallet, whichever way it comes. */
export function DepositDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const accountId = useNearWallet((s) => s.accountId);
  const [tab, setTab] = useState<Tab>('near');

  return (
    <Dialog open={open && !!accountId} onOpenChange={onOpenChange}>
      <DialogContent data-testid="deposit-dialog" className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogTitle>Deposit</DialogTitle>
        <DialogDescription className="sr-only">Add {USDC_SYMBOL} to your NEAR account.</DialogDescription>
        {accountId && (
          // min-w-0: a 64-character implicit account id must not widen the dialog.
          <div className="flex min-w-0 flex-col gap-4">
            <SegmentedTabs value={tab} onChange={setTab} options={TABS} data-testid="deposit-tabs" />
            {tab === 'near' ? <NearTab accountId={accountId} /> : <OtherChainsTab accountId={accountId} />}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
