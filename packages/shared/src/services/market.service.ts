
export interface OutcomeRule {
  rule: string;
  /** 0 = YES, 1 = NO. */
  outcomeIndex: number;
  /** Optional custom display label for this outcome (e.g. "Over", "Trump"). */
  label?: string;
  /** Optional accent color for this outcome. */
  color?: string;
}

export interface MarketRules {
  description?: string;
  outcomeRules?: OutcomeRule[];
}
