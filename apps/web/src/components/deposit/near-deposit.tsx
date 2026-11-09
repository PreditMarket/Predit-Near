'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { AddressRow } from '@/components/v2/address-row';
import { SegmentedTabs } from '@/components/v2';
import { Button } from '@/components/ui/button';
import { useNearFunds } from '@/hooks/pamm/use-near-funds';
import { nearExplorerTxUrl, USDC_DECIMALS, USDC_SYMBOL } from '@/lib/near/config';
import { claimNearFaucet, getNearFaucetReadyAt } from '@/lib/near/contract';
import { getNearNativeBalance } from '@/lib/near/rpc';
import {
  SIMULATED_CHAINS,
  simulatedAddress,
  type SimulatedChain,
} from '@/lib/near/simulated-deposit';
import { useNearWallet } from '@/store/near-wallet.store';

type Tab = 'near' | 'other';
type SimStep = 'idle' | 'PENDING_DEPOSIT' | 'PROCESSING' | 'SUCCESS' | 'FAILED';

const TABS = [
  { value: 'near' as const, label: 'NEAR' },
  { value: 'other' as const, label: 'Other chains' },
];
const SIM_STEPS: SimStep[] = ['PENDING_DEPOSIT', 'PROCESSING', 'SUCCESS'];
const CARD = 'flex flex-col gap-4 rounded-xl border border-border bg-elevated p-4 sm:flex-row';
const STAT = 'rounded-lg border border-border bg-background/40 px-3 py-2';
const STAT_LABEL = 'font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground';

function formatWait(ms: number) {
  const minutes = Math.ceil(ms / 60_000);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}

function Balances({ accountId }: { accountId: string }) {
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
      void queryClient.invalidateQueries({ queryKey: ['near'] });
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

function OtherChainsTab({ accountId }: { accountId: string }) {
  const queryClient = useQueryClient();
  const [chain, setChain] = useState<SimulatedChain>('base');
  const [amount, setAmount] = useState('100');
  const [step, setStep] = useState<SimStep>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const address = simulatedAddress(chain, accountId);
  const running = step === 'PENDING_DEPOSIT' || step === 'PROCESSING';
  const value = Number(amount);

  const simulate = async () => {
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
      if (!res.ok) throw new Error(body.error ?? 'Simulated deposit failed');
      setTxHash(body.txHash ?? null);
      setStep('SUCCESS');
      void queryClient.invalidateQueries({ queryKey: ['near'] });
    } catch (err) {
      setError((err as Error).message);
      setStep('FAILED');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div
        data-testid="testnet-simulation-label"
        className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[12px] text-warning"
      >
        <strong>Testnet simulation.</strong> No funds move on any other chain. Do not send real money: the
        address below is not a real address.
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
      <div className={CARD}>
        <div className="self-center rounded-lg bg-white p-2">
          <QRCodeSVG value={address} size={140} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <AddressRow label="Simulated deposit address" address={address} full />
          <label className="flex flex-col gap-1">
            <span className={STAT_LABEL}>Amount (1 to 1,000)</span>
            <input
              data-testid="simulate-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-9 rounded-md border border-border bg-background px-3 font-mono text-[13px] outline-none"
            />
          </label>
          <Balances accountId={accountId} />
        </div>
      </div>
      <Button
        data-testid="simulate-deposit"
        disabled={running || !(value >= 1 && value <= 1000)}
        onClick={() => void simulate()}
      >
        {running ? 'Simulating…' : 'Simulate deposit'}
      </Button>
      {step !== 'idle' && (
        <ol className="flex flex-col gap-1 font-mono text-[12px]" data-testid="simulate-status">
          {SIM_STEPS.map((s) => {
            const reached = step === 'FAILED' ? false : SIM_STEPS.indexOf(step) >= SIM_STEPS.indexOf(s);
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
                View the credit on the explorer
              </a>
            </li>
          )}
        </ol>
      )}
    </div>
  );
}

/** Funding: tUSDC lands in the account's own NEAR wallet, whichever way it comes. */
export function NearDeposit() {
  const accountId = useNearWallet((s) => s.accountId);
  const status = useNearWallet((s) => s.status);
  const connect = useNearWallet((s) => s.connect);
  const [tab, setTab] = useState<Tab>('near');

  if (!accountId) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-[13px] text-muted-foreground">Connect a NEAR wallet to deposit.</p>
        <Button disabled={status === 'loading'} onClick={() => void connect()}>
          {status === 'loading' ? 'Connecting…' : 'Connect wallet'}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-[18px] font-bold">Deposit</h1>
      <SegmentedTabs value={tab} onChange={setTab} options={TABS} data-testid="deposit-tabs" />
      {tab === 'near' ? <NearTab accountId={accountId} /> : <OtherChainsTab accountId={accountId} />}
    </div>
  );
}
