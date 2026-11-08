'use client';

import { Settings } from 'lucide-react';
import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface TradeDetail {
  label: string;
  value: string;
}

const SLIP_PRESETS: Array<{ bps: number; label: string }> = [
  { bps: 50, label: '0.5%' },
  { bps: 100, label: '1%' },
  { bps: 200, label: '2%' },
  { bps: 500, label: '5%' },
];

interface SettingsPopoverProps {
  slippageBps: number;
  onSlippageChange: (bps: number) => void;
  details: TradeDetail[];
}

/** Settings pill (right side of the adv row). Turq mini-chip shows current
 * slippage inline. Popover opens above the CTA with slippage picker + a
 * live trade-details table. */
export function SettingsPopover({
  slippageBps,
  onSlippageChange,
  details,
}: SettingsPopoverProps) {
  const [open, setOpen] = useState(false);
  const currentLabel =
    SLIP_PRESETS.find((p) => p.bps === slippageBps)?.label ??
    `${(slippageBps / 100).toFixed(2)}%`;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex cursor-pointer items-center gap-[5px] rounded-full border border-white/[0.06] bg-card px-[10px] py-[5px] font-mono text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground transition-colors hover:border-primary hover:bg-primary/[0.06] hover:text-primary"
        >
          <Settings className="h-[12px] w-[12px]" />
          <span>Settings</span>
          <span className="rounded-[3px] bg-primary/[0.08] px-[5px] py-[1px] font-mono text-[9.5px] font-bold normal-case tracking-normal text-primary">
            {currentLabel}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        sideOffset={6}
        className="w-[240px] rounded-[10px] border border-white/[0.14] bg-card p-[12px] font-mono text-[11.5px] shadow-[0_8px_24px_rgba(0,0,0,0.3)]"
      >
        <div className="mb-[6px] font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-faint">
          Slippage tolerance
        </div>
        <div className="grid grid-cols-4 gap-[4px]">
          {SLIP_PRESETS.map((p) => {
            const on = p.bps === slippageBps;
            return (
              <button
                key={p.bps}
                type="button"
                onClick={() => onSlippageChange(p.bps)}
                className={`cursor-pointer rounded-[6px] border p-[6px] font-mono text-[11px] font-bold transition-colors ${
                  on
                    ? 'border-primary bg-primary/[0.06] text-primary'
                    : 'border-white/[0.06] bg-card text-muted-foreground hover:border-white/[0.14] hover:text-foreground'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        {details.length > 0 && (
          <div className="mt-[10px] border-t border-white/[0.06] pt-[10px]">
            <div className="mb-[6px] font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-faint">
              Trade details
            </div>
            <div className="space-y-[2px]">
              {details.map((row) => (
                <div
                  key={row.label}
                  className="flex items-baseline justify-between gap-[8px] py-[4px] text-muted-foreground"
                >
                  <span>{row.label}</span>
                  <span className="font-bold text-foreground">{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
