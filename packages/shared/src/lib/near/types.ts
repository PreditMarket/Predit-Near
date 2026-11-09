/** The JSON the market contract returns. Amounts are strings of raw units. */

export type NearSide = 'yes' | 'no';
export type NearInvalidKind = 'source_unavailable' | 'ambiguous_rules';
export type NearOutcome = NearSide | { invalid: NearInvalidKind };
export type NearStatus = 'open' | 'receipt_posted' | 'challenged' | 'finalized' | 'cancelled';

export interface NearAiReading {
  model: string;
  chat_id: string;
  signed_text: string;
  signature: string;
  signing_address: string;
}

export interface NearEvidence {
  hash: string;
  uri: string;
  ai: NearAiReading | null;
}

export interface NearReceipt {
  outcome: NearOutcome;
  reason: string;
  evidence: NearEvidence;
  posted_at_sec: string;
}

export interface NearChallenge {
  challenger: string;
  bond: string;
  reason_uri: string;
  at_sec: string;
}

export interface NearPost {
  source: string;
  post_id: string;
  author_ref: string;
  text: string;
}

export interface NearRules {
  question: string;
  description: string;
  yes_label: string;
  no_label: string;
  yes_condition: string;
  no_condition: string;
  resolution_source: string;
  invalid_conditions: string;
  category: string;
  image_url: string;
  expiry_sec: string;
}

export interface NearMarket {
  id: string;
  creator: string;
  post: NearPost;
  claim_side: NearSide;
  rules: NearRules;
  rules_hash: string;
  draft: { model: string; chat_id: string };
  creation_bond: string;
  challenge_window_sec: number;
  created_at_sec: string;
  status: NearStatus;
  outcome: NearOutcome | null;
  receipt: NearReceipt | null;
  challenge: NearChallenge | null;
  price_yes_bps: number;
  pool_collateral: string;
  total_yes: string;
  total_no: string;
  volume: string;
  trades: number;
  yes_shares: string;
  no_shares: string;
  virtual_liquidity_l: string;
  trade_fee_bps: number;
  redeem_fee_bps: number;
  creator_share_bps: number;
  trade_freeze_sec: number;
  refunds_only: boolean;
  resolved_pool_collateral: string;
  resolved_x_win: string;
  resolved_ts: string;
  resolved_redeem_fee_bps: number;
}

export interface NearPosition {
  yes_shares: string;
  no_shares: string;
  yes_cost: string;
  no_cost: string;
}

export interface NearForecastRecord {
  correct: number;
  wrong: number;
}
