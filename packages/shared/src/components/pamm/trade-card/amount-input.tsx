'use client';

import { forwardRef, type KeyboardEvent } from 'react';

interface AmountInputProps {
  value: string;
  onChange: (next: string) => void;
  onSubmit?: () => void;
  disabled?: boolean;
  /** Right-aligned unit label — USDC in blue on Buy, "shares" in green on Sell. */
  unit: string;
  unitTone: 'buy' | 'sell';
  /** Native floor for the number input's spinner/validation. Defaults to 0. */
  min?: number;
}

/** Big amount input with a right-aligned unit label. Focus ring lives on the
 * parent so the field reads as one block with the pay-with row above. */
export const AmountInput = forwardRef<HTMLInputElement, AmountInputProps>(
  function AmountInput(
    { value, onChange, onSubmit, disabled, unit, unitTone, min = 0 },
    ref,
  ) {
    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && onSubmit) {
        e.preventDefault();
        onSubmit();
      }
    };
    // USDC blue #4a9eff for Buy, green-400 for Sell "shares" — mockup values.
    const unitCls = unitTone === 'buy' ? 'text-primary' : 'text-success';
    return (
      <div className="flex items-center gap-[8px] rounded-[10px] border border-white/[0.06] bg-card p-[14px] transition-colors focus-within:border-primary">
        <input
          ref={ref}
          data-testid="amount-input"
          type="number"
          inputMode="decimal"
          min={min}
          step="any"
          value={value}
          disabled={disabled}
          placeholder="0"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onWheel={(e) => e.currentTarget.blur()}
          className="min-w-0 flex-1 border-none bg-transparent font-mono text-[24px] font-extrabold tracking-[-0.01em] text-foreground outline-none placeholder:text-faint disabled:opacity-60"
        />
        <span className={`font-mono text-[13px] font-bold ${unitCls}`}>
          {unit}
        </span>
      </div>
    );
  },
);
