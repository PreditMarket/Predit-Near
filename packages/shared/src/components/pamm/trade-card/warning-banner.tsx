'use client';

import { AlertOctagon, AlertTriangle, Info } from 'lucide-react';
import type { ReactNode } from 'react';

/** Severity ranking used both for palette AND for the "highest wins"
 * banner-priority ordering in the trade card. Higher index = louder. */
export type WarnSeverity = 'info' | 'warning' | 'danger';

export const SEVERITY_ORDER: Record<WarnSeverity, number> = {
  info: 0,
  warning: 1,
  danger: 2,
};

interface WarningBannerProps {
  severity: WarnSeverity;
  children: ReactNode;
  /** Optional CTA/link rendered below the main line (kept subtle). */
  action?: ReactNode;
}

/** Inline banner shown above the CTA. Calm colour tints + small icon so the
 * whole card stays quiet unless something needs attention. One banner at a
 * time — the highest-severity active guard wins. */
export function WarningBanner({ severity, children, action }: WarningBannerProps) {
  const palette: Record<WarnSeverity, string> = {
    info: 'border-[var(--brand-primary-border)] bg-[var(--brand-primary-soft)] text-foreground/90',
    warning: 'border-warning/40 bg-warning/10 text-warning',
    danger:
      'border-[var(--brand-danger-border)] bg-[var(--brand-danger-soft)] text-[color:var(--brand-red)]',
  };
  const Icon =
    severity === 'danger' ? AlertOctagon : severity === 'warning' ? AlertTriangle : Info;
  return (
    <div
      className={`flex items-start gap-2 rounded-[8px] border px-3 py-2 font-mono text-[11px] leading-relaxed ${palette[severity]}`}
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1">
        <div>{children}</div>
        {action && <div className="text-muted-foreground">{action}</div>}
      </div>
    </div>
  );
}
