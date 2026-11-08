'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';

const shorten = (address: string) =>
  address.length > 16 ? `${address.slice(0, 6)}…${address.slice(-6)}` : address;

export function AddressRow({
  label,
  address,
  full = false,
}: {
  label: string;
  address: string;
  /** Show the whole address (deposit screens) instead of a shortened one. */
  full?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy address');
    }
  };

  const copyButton = (
    <button
      type="button"
      onClick={copy}
      aria-label="Copy address"
      className="touch-hit shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
    >
      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
    </button>
  );

  // A whole address beside its label gets squeezed into a narrow column and
  // wraps into three ragged lines. Stacked, it takes the full width and wraps
  // evenly — and the address itself copies on click, like the button.
  if (full) {
    return (
      <div className="rounded-lg border border-border px-3 py-2.5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
            {label}
          </span>
          {copyButton}
        </div>
        <button
          type="button"
          onClick={copy}
          title="Copy address"
          className="mt-1 block w-full break-all text-left font-mono text-[13px] leading-relaxed text-foreground transition-colors hover:text-primary"
        >
          {address}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
      <span className="w-10 shrink-0 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
        {label}
      </span>
      <span
        className="flex-1 min-w-0 truncate font-mono text-[13px]"
        title={address}
      >
        {shorten(address)}
      </span>
      {copyButton}
    </div>
  );
}
