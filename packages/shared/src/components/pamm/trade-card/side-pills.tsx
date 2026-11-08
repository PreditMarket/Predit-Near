'use client';

import type { SwapSide } from '@/services/pamm/swap';
import { pct2 } from './formatters';

interface SidePillsProps {
  side: SwapSide;
  onSideChange: (side: SwapSide) => void;
  yesPrice: number; // 0..1
  noPrice: number;  // 0..1
  yesLabel?: string;
  noLabel?: string;
}

/** YES / NO pills — big percent price on the right, small-caps label on the
 * left. Idle uses a 6%-tint fill + 28%-tint border. Active goes to 18%-tint
 * + green-strong / red-strong border. Hover bumps border to border-hi. */
export function SidePills({
  side,
  onSideChange,
  yesPrice,
  noPrice,
  yesLabel = 'Yes',
  noLabel = 'No',
}: SidePillsProps) {
  return (
    <div className="grid grid-cols-2 gap-[6px]">
      <PillButton
        active={side === 'yes'}
        tone="yes"
        label={yesLabel}
        priceText={pct2(yesPrice)}
        onClick={() => onSideChange('yes')}
        testId="side-yes"
      />
      <PillButton
        active={side === 'no'}
        tone="no"
        label={noLabel}
        priceText={pct2(noPrice)}
        onClick={() => onSideChange('no')}
        testId="side-no"
      />
    </div>
  );
}

interface PillButtonProps {
  active: boolean;
  tone: 'yes' | 'no';
  label: string;
  priceText: string;
  onClick: () => void;
  testId?: string;
}

function PillButton({ active, tone, label, priceText, onClick, testId }: PillButtonProps) {
  const isYes = tone === 'yes';
  // Active: green-strong (#22c55e = green-500) / red-strong (#ef4444 = red-500)
  //         border, 18% tint fill.
  const activeCls = isYes
    ? 'border-success bg-success/[0.18]'
    : 'border-danger bg-danger/[0.18]';
  // Idle: 28% tint border, 6% tint fill; hover raises border to border-hi.
  const idleCls = isYes
    ? 'border-success/[0.28] bg-success/[0.06] hover:border-white/[0.14]'
    : 'border-danger/[0.28] bg-danger/[0.06] hover:border-white/[0.14]';
  const textCls = isYes ? 'text-success' : 'text-danger';
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={`flex cursor-pointer items-baseline justify-between rounded-[10px] border p-[14px] text-left transition-colors ${
        active ? activeCls : idleCls
      }`}
    >
      <span
        className={`font-mono text-[11px] font-extrabold uppercase tracking-[0.08em] ${textCls}`}
      >
        {label}
      </span>
      <span
        className={`font-mono text-[24px] font-extrabold leading-none ${textCls}`}
      >
        {priceText}
      </span>
    </button>
  );
}
