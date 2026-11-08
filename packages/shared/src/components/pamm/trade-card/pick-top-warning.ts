import type { ReactNode } from 'react';

import { SEVERITY_ORDER, type WarnSeverity } from './warning-banner';

export interface WarningCandidate {
  key: string;
  severity: WarnSeverity;
  when: boolean;
  content: ReactNode;
  action?: ReactNode;
}

/** Pick the highest-severity active warning (first-encountered wins on tie).
 * Returns null when nothing is active — the CTA row still renders alone. */
export function pickTopWarning(
  candidates: WarningCandidate[],
): WarningCandidate | null {
  let best: WarningCandidate | null = null;
  for (const c of candidates) {
    if (!c.when) continue;
    if (!best || SEVERITY_ORDER[c.severity] > SEVERITY_ORDER[best.severity]) {
      best = c;
    }
  }
  return best;
}
