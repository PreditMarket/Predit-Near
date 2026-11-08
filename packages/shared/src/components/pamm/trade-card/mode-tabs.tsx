'use client';

import type { TradeMode } from './types';

interface ModeTabsProps {
  mode: TradeMode;
  onModeChange: (mode: TradeMode) => void;
  /** Cancelled markets are sell-only — buy is disabled. */
  buyDisabled?: boolean;
}

/** Buy / Sell segmented pill. Active button lifts up onto bg-card and picks
 * up a green (buy) or red (sell) tint, matching the mockup exactly. */
export function ModeTabs({ mode, onModeChange, buyDisabled = false }: ModeTabsProps) {
  const tabs: TradeMode[] = ['buy', 'sell'];
  return (
    <div className="grid grid-cols-2 gap-[3px] rounded-[8px] bg-card p-[3px]">
      {tabs.map((m) => {
        const isActive = mode === m;
        const disabled = buyDisabled && m === 'buy';
        const activeBg =
          m === 'buy'
            ? 'bg-success/[0.18] border-success/60 text-success shadow-[inset_0_0_0_1px_rgba(34,209,126,0.28)]'
            : 'bg-danger/[0.18] border-danger/60 text-danger shadow-[inset_0_0_0_1px_rgba(255,87,87,0.28)]';
        return (
          <button
            key={m}
            type="button"
            data-mode={m}
            disabled={disabled}
            onClick={() => !disabled && onModeChange(m)}
            className={`rounded-[6px] border p-[7px] font-mono text-[11.5px] font-bold uppercase tracking-[0.05em] transition-colors ${
              disabled ? 'cursor-not-allowed opacity-30' : 'cursor-pointer'
            } ${
              isActive
                ? activeBg
                : 'border-transparent bg-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {m}
          </button>
        );
      })}
    </div>
  );
}
