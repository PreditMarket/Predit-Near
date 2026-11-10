'use client';

import Link from 'next/link';
import { ChevronDown, Copy, ExternalLink, LogOut, UserRound, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { nearExplorerAccountUrl } from '@/lib/near/config';
import { useNearWallet } from '@/store/near-wallet.store';

const PILL =
  'inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 font-mono text-[12px] text-foreground hover:bg-muted';
/** The same height as the balance pill beside it. */
const ACCOUNT_PILL =
  'group inline-flex h-6.5 items-center gap-1.5 rounded-md border border-border bg-muted/20 px-2.5 font-mono text-[10.5px] font-bold leading-none text-foreground transition-colors hover:border-ring data-[state=open]:border-ring';

/** Connect button when signed out; the account and sign-out when signed in. The balance has its own pill. */
export function NearAccountMenu() {
  const accountId = useNearWallet((s) => s.accountId);
  const status = useNearWallet((s) => s.status);
  const connect = useNearWallet((s) => s.connect);
  const disconnect = useNearWallet((s) => s.disconnect);

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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={ACCOUNT_PILL} data-testid="near-account">
        <UserRound className="size-3 text-muted-foreground" />
        <span className="hidden max-w-[160px] truncate sm:inline">{accountId}</span>
        <ChevronDown className="size-3 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
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
