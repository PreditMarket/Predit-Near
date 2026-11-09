'use client';

import { ExternalLink } from 'lucide-react';
import { nearExplorerAccountUrl } from '@/lib/near/config';
import { useNearWallet } from '@/store/near-wallet.store';

/** Whose portfolio this is: the connected NEAR account, or a way to connect one. */
export function PortfolioIdentity() {
  const accountId = useNearWallet((s) => s.accountId);
  const status = useNearWallet((s) => s.status);
  const connect = useNearWallet((s) => s.connect);

  return (
    <section data-testid="portfolio-identity" className="mb-4">
      {accountId ? (
        <a
          href={nearExplorerAccountUrl(accountId)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 font-mono text-[15px] font-bold text-foreground hover:underline"
        >
          {accountId}
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
        </a>
      ) : (
        <button
          type="button"
          disabled={status === 'loading'}
          onClick={() => void connect()}
          className="rounded-lg bg-primary px-4 py-2 font-mono text-[12px] font-bold text-primary-foreground disabled:opacity-50"
        >
          {status === 'loading' ? 'Connecting…' : 'Connect a NEAR wallet to see your portfolio'}
        </button>
      )}
    </section>
  );
}
