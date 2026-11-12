export interface OutcomeRule {
  rule: string;
  /** 0 = YES, 1 = NO. */
  outcomeIndex: number;
}

export interface MarketRules {
  outcomeRules?: OutcomeRule[];
}
