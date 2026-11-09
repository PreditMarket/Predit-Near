'use client';

import Link from 'next/link';
import { ChevronDown, Copy, ExternalLink, LogOut, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useNearFunds } from '@/hooks/pamm/use-near-funds';
import { nearExplorerAccountUrl, USDC_DECIMALS, USDC_SYMBOL } from '@/lib/near/config';
import { useNearWallet } from '@/store/near-wallet.store';

const PILL =
  'inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 font-mono text-[12px] text-foreground hover:bg-muted';

/** Connect button when signed out; account, balance and sign-out when signed in. */
export function NearAccountMenu() {
  const accountId = useNearWallet((s) => s.accountId);
  const status = useNearWallet((s) => s.status);
  const connect = useNearWallet((s) => s.connect);
  const disconnect = useNearWallet((s) => s.disconnect);
  const { data: funds } = useNearFunds();

  if (!accountId) {
    return (
      <button
        type="button"
        className={PILL}
        disabled={status === 'loading'}
        onClick={() => void connect()}
        data-testid="near-connect"
      >
        <Wallet className="h-3.5 w-3.5" />
        {status === 'loading' ? 'Connecting…' : 'Connect wallet'}
      </button>
    );
  }

  const balance = funds ? Number(funds.usdc) / 10 ** USDC_DECIMALS : null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={PILL} data-testid="near-account">
        <span className="tabular-nums">
          {balance === null ? '…' : balance.toLocaleString('en-US', { maximumFractionDigits: 2 })}{' '}
          {USDC_SYMBOL}
        </span>
        <span className="hidden max-w-[140px] truncate text-muted-foreground sm:inline">
          {accountId}
        </span>
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href="/deposit">Deposit</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/portfolio">Portfolio</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            void navigator.clipboard.writeText(accountId);
            toast.success('Account copied');
          }}
        >
          <Copy className="mr-2 h-3.5 w-3.5" /> Copy account
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={nearExplorerAccountUrl(accountId)} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-2 h-3.5 w-3.5" /> View on explorer
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void disconnect()}>
          <LogOut className="mr-2 h-3.5 w-3.5" /> Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
