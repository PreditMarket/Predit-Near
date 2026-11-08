'use client';

export interface QuickChip {
  /** Display label ("$25", "50%", "Max"). */
  label: string;
  /** Whether the chip is currently the source of the amount input. */
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
}

/** 4-column row of quick-fill chips. Buy shows fixed USDC amounts + MAX; Sell
 * shows percent-of-held. Active chip picks up the turq brand tint per mockup. */
export function QuickChips({ chips }: { chips: QuickChip[] }) {
  return (
    <div className="grid grid-cols-4 gap-[4px]">
      {chips.map((chip) => (
        <button
          key={chip.label}
          type="button"
          disabled={chip.disabled}
          onClick={chip.onClick}
          className={`rounded-[6px] border px-[4px] py-[7px] font-mono text-[11.5px] font-bold transition-colors ${
            chip.disabled
              ? 'cursor-not-allowed border-transparent bg-card text-faint/60'
              : chip.active
                ? 'cursor-pointer border-primary bg-primary/[0.06] text-primary'
                : 'cursor-pointer border-transparent bg-card text-muted-foreground hover:border-white/[0.14] hover:text-foreground'
          }`}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
