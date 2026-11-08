'use client';

import { ChevronDown } from 'lucide-react';

interface AdvanceToggleProps {
  open: boolean;
  onToggle: () => void;
}

/** Pill on the left of the settings row. Rotates its caret when open.
 * Matches mockup: bg-elev, 1px border, 5×10 padding, uppercase mono 11px. */
export function AdvanceToggle({ open, onToggle }: AdvanceToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex cursor-pointer items-center gap-[5px] rounded-full border border-white/[0.06] bg-card px-[10px] py-[5px] font-mono text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground transition-colors hover:border-primary hover:bg-primary/[0.06] hover:text-primary"
    >
      <span>Advance</span>
      <ChevronDown
        className={`h-[8px] w-[8px] text-faint transition-transform ${
          open ? 'rotate-180' : ''
        }`}
      />
    </button>
  );
}
