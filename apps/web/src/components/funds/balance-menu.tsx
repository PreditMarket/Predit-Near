'use client';

import { forwardRef, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowUpFromLine, ChevronDown, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { useNearFunds } from '@/hooks/pamm/use-near-funds';
import { USDC_DECIMALS, USDC_SYMBOL } from '@/lib/near/config';
import { getNearNativeBalance } from '@/lib/near/rpc';
import { useFundsDialog, type FundsDialog } from '@/store/funds-dialog.store';
import { useNearWallet } from '@/store/near-wallet.store';

/** A tUSDC amount; a dust amount reads as `<0.01` rather than as nothing. */
export function formatUsdc(raw: bigint | undefined): string {
  if (raw === undefined) return '…';
  const value = Number(raw) / 10 ** USDC_DECIMALS;
  if (value > 0 && value < 0.01) return '<0.01';
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}
const usdc = formatUsdc;

/** Forwards the trigger's props and ref (Radix and vaul pass them in). */
const Pill = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<'button'> & { label: ReactNode }>(function Pill(
  { label, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      data-testid="balance-pill"
      className="group inline-flex h-6.5 items-center gap-1.5 rounded-md border border-border bg-muted/20 px-2.5 font-mono text-[10.5px] font-bold leading-none tabular-nums text-foreground transition-colors hover:border-ring data-[state=open]:border-ring"
      {...props}
    >
      <Wallet className="size-3 text-muted-foreground" />
      {label}
      <ChevronDown className="size-3 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
    </button>
  );
});

function Row({ label, value, testId }: { label: string; value: ReactNode; testId?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[12px]">
      <span className="text-muted-foreground">{label}</span>
      <span data-testid={testId} className="font-mono tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}

function MenuBody({ onFunds, onNavigate }: { onFunds: (dialog: FundsDialog) => void; onNavigate: () => void }) {
  const accountId = useNearWallet((s) => s.accountId) as string;
  const { data: funds } = useNearFunds();
  const { data: native } = useQuery({
    queryKey: ['near', 'balance', 'native', accountId],
    queryFn: () => getNearNativeBalance(accountId),
    refetchInterval: 15_000,
  });
  const claimable = funds?.claimable ?? BigInt(0);

  return (
    <div className="flex flex-col gap-4" data-testid="balance-menu">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-muted-foreground">Wallet balance</span>
        <span data-testid="balance-menu-usdc" className="font-mono text-[18px] font-bold tabular-nums">
          {usdc(funds?.usdc)} {USDC_SYMBOL}
        </span>
      </div>
      <div className="flex flex-col gap-1.5 border-t border-border pt-2.5">
        {claimable > BigInt(0) && <Row label="Ready to withdraw" value={`${usdc(claimable)} ${USDC_SYMBOL}`} testId="balance-menu-claimable" />}
        <Row
          label="NEAR for gas"
          value={native === undefined ? '…' : (Number(native ?? BigInt(0)) / 1e24).toLocaleString('en-US', { maximumFractionDigits: 3 })}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button data-testid="balance-deposit" onClick={() => onFunds('deposit')}>
          <ArrowDownToLine className="size-3.5" />
          Deposit
        </Button>
        <Button data-testid="balance-withdraw" variant="outline" onClick={() => onFunds('withdraw')}>
          <ArrowUpFromLine className="size-3.5" />
          Withdraw
        </Button>
      </div>
      <Link href="/portfolio" onClick={onNavigate} className="text-center text-[11.5px] text-primary hover:underline">
        Positions and created markets in Portfolio
      </Link>
    </div>
  );
}

/** The nav's money: the account's tUSDC, opening its detail and the deposit and withdraw dialogs. */
export function BalanceMenu() {
  const accountId = useNearWallet((s) => s.accountId);
  const isMobile = useIsMobile(1024);
  const [open, setOpen] = useState(false);
  const { data: funds } = useNearFunds();
  const openFunds = useFundsDialog((s) => s.open);
  if (!accountId) return null;

  const pill = <Pill label={`${usdc(funds?.usdc)} ${USDC_SYMBOL}`} />;
  // Mounted only while open: the detail reads nothing until then.
  const body = open ? (
    <MenuBody
      onNavigate={() => setOpen(false)}
      onFunds={(dialog) => {
        // The dialog takes over the screen; the menu gets out of its way.
        setOpen(false);
        openFunds(dialog);
      }}
    />
  ) : null;

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen} direction="bottom">
        <DrawerTrigger asChild>{pill}</DrawerTrigger>
        <DrawerContent style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <DrawerHeader className="sr-only">
            <DrawerTitle>Balance</DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pt-3 pb-4">{body}</div>
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{pill}</PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-4">
        {body}
      </PopoverContent>
    </Popover>
  );
}
