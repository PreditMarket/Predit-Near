//! On-chain state and JSON shapes.

use near_sdk::json_types::{U128, U64};
use near_sdk::{near, AccountId, NearToken};
use predit_core::business::{PoolSnapshot, PositionSnapshot};
use predit_core::state::Side as CoreSide;

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Side {
    Yes,
    No,
}

impl From<Side> for CoreSide {
    fn from(side: Side) -> Self {
        match side {
            Side::Yes => CoreSide::Yes,
            Side::No => CoreSide::No,
        }
    }
}

/// Why a market ended without a winner. Only `AmbiguousRules` costs the
/// creator their bond: a source going dark is nobody's fault.
#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum InvalidKind {
    SourceUnavailable,
    AmbiguousRules,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Outcome {
    Yes,
    No,
    Invalid(InvalidKind),
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    Open,
    ReceiptPosted,
    Challenged,
    Finalized,
    Cancelled,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Config {
    pub creation_bond: NearToken,
    pub challenge_bond: NearToken,
    pub default_challenge_window_sec: u32,
    pub min_challenge_window_sec: u32,
    pub max_challenge_window_sec: u32,
    pub stuck_after_sec: u32,
    /// In collateral atoms.
    pub min_buy: U64,
    pub max_markets_per_post: u8,
    pub trade_fee_bps: u16,
    pub redeem_fee_bps: u16,
    pub creator_share_bps: u16,
    pub trade_freeze_sec: u32,
    pub virtual_liquidity_l: U64,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            creation_bond: NearToken::from_near(1),
            challenge_bond: NearToken::from_near(1),
            default_challenge_window_sec: 60 * 60,
            min_challenge_window_sec: 60,
            max_challenge_window_sec: 7 * 24 * 60 * 60,
            stuck_after_sec: 7 * 24 * 60 * 60,
            min_buy: U64(1_000_000),
            max_markets_per_post: 5,
            trade_fee_bps: 30,
            redeem_fee_bps: 100,
            creator_share_bps: 1_000,
            trade_freeze_sec: 10,
            virtual_liquidity_l: U64(500_000_000),
        }
    }
}

/// The post a market was created from.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PostRef {
    pub source: String,
    pub post_id: String,
    /// Whose forecasting record this market counts for, e.g. `x:handle`.
    pub author_ref: String,
    /// Snapshot, so the market still reads when the post is deleted.
    pub text: String,
}

/// Everything that is locked at creation. No method can change it.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Rules {
    pub question: String,
    pub description: String,
    pub yes_label: String,
    pub no_label: String,
    pub yes_condition: String,
    pub no_condition: String,
    pub resolution_source: String,
    pub invalid_conditions: String,
    pub category: String,
    /// Empty, or an `https://` image URL.
    pub image_url: String,
    pub expiry_sec: U64,
}

/// Records which model drafted the wording. It has no say in the outcome.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DraftRef {
    pub model: String,
    pub chat_id: String,
}

/// The NEAR AI reading a person confirmed before the receipt was posted.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AiReading {
    pub model: String,
    pub chat_id: String,
    /// What the enclave signed: `request_hash:response_hash`.
    pub signed_text: String,
    pub signature: String,
    /// The enclave's address, matched against its attestation report.
    pub signing_address: String,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Evidence {
    /// Hex sha256 of the source content, captured at expiry.
    pub hash: String,
    pub uri: String,
    pub ai: Option<AiReading>,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Report {
    Proposed { outcome: Side, reason: String },
    Invalid { kind: InvalidKind, reason: String },
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Receipt {
    pub outcome: Outcome,
    pub reason: String,
    pub evidence: Evidence,
    pub posted_at_sec: U64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Challenge {
    pub challenger: AccountId,
    pub bond: NearToken,
    pub reason_uri: String,
    pub at_sec: U64,
}

#[near(serializers = [json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Decision {
    Uphold,
    Overturn(Outcome),
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PoolState {
    pub yes_shares: u128,
    pub no_shares: u128,
    pub pool_collateral: u64,
    pub total_yes_cost_acc: u128,
    pub total_no_cost_acc: u128,
    pub virtual_liquidity_l: u64,
    pub expiry_ts: i64,
    pub trade_freeze_seconds: u32,
    pub trade_fee_bps: u16,
    pub redeem_fee_bps: u16,
    pub creator_share_bps: u16,
    pub resolution_code: u8,
    pub cancelled: bool,
    pub mode: u8,
    pub resolved_pool_collateral: u64,
    pub resolved_x_win: u128,
    pub resolved_win_shares: u128,
    pub resolved_ts: i64,
    pub resolved_redeem_fee_bps: u16,
}

impl From<&PoolState> for PoolSnapshot {
    fn from(p: &PoolState) -> Self {
        Self {
            yes_shares: p.yes_shares,
            no_shares: p.no_shares,
            pool_collateral: p.pool_collateral,
            total_yes_cost_acc: p.total_yes_cost_acc,
            total_no_cost_acc: p.total_no_cost_acc,
            virtual_liquidity_l: p.virtual_liquidity_l,
            expiry_ts: p.expiry_ts,
            trade_freeze_seconds: p.trade_freeze_seconds,
            trade_fee_bps: p.trade_fee_bps,
            redeem_fee_bps: p.redeem_fee_bps,
            creator_share_bps: p.creator_share_bps,
            resolution_code: p.resolution_code,
            cancelled: p.cancelled,
            mode: p.mode,
            resolved_pool_collateral: p.resolved_pool_collateral,
            resolved_x_win: p.resolved_x_win,
            resolved_win_shares: p.resolved_win_shares,
            resolved_ts: p.resolved_ts,
            resolved_redeem_fee_bps: p.resolved_redeem_fee_bps,
        }
    }
}

impl From<PoolSnapshot> for PoolState {
    fn from(p: PoolSnapshot) -> Self {
        Self {
            yes_shares: p.yes_shares,
            no_shares: p.no_shares,
            pool_collateral: p.pool_collateral,
            total_yes_cost_acc: p.total_yes_cost_acc,
            total_no_cost_acc: p.total_no_cost_acc,
            virtual_liquidity_l: p.virtual_liquidity_l,
            expiry_ts: p.expiry_ts,
            trade_freeze_seconds: p.trade_freeze_seconds,
            trade_fee_bps: p.trade_fee_bps,
            redeem_fee_bps: p.redeem_fee_bps,
            creator_share_bps: p.creator_share_bps,
            resolution_code: p.resolution_code,
            cancelled: p.cancelled,
            mode: p.mode,
            resolved_pool_collateral: p.resolved_pool_collateral,
            resolved_x_win: p.resolved_x_win,
            resolved_win_shares: p.resolved_win_shares,
            resolved_ts: p.resolved_ts,
            resolved_redeem_fee_bps: p.resolved_redeem_fee_bps,
        }
    }
}

#[near(serializers = [borsh])]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub struct Position {
    pub yes_shares: u128,
    pub no_shares: u128,
    pub yes_cost_acc: u128,
    pub no_cost_acc: u128,
}

impl From<Position> for PositionSnapshot {
    fn from(p: Position) -> Self {
        Self {
            yes_shares: p.yes_shares,
            no_shares: p.no_shares,
            yes_cost_acc: p.yes_cost_acc,
            no_cost_acc: p.no_cost_acc,
        }
    }
}

impl From<PositionSnapshot> for Position {
    fn from(p: PositionSnapshot) -> Self {
        Self {
            yes_shares: p.yes_shares,
            no_shares: p.no_shares,
            yes_cost_acc: p.yes_cost_acc,
            no_cost_acc: p.no_cost_acc,
        }
    }
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Market {
    pub id: u64,
    pub creator: AccountId,
    pub post: PostRef,
    pub claim_side: Side,
    pub rules: Rules,
    pub rules_hash: Vec<u8>,
    pub draft: DraftRef,
    pub creation_bond: NearToken,
    pub challenge_window_sec: u32,
    pub created_at_sec: u64,
    pub status: Status,
    pub outcome: Option<Outcome>,
    pub receipt: Option<Receipt>,
    pub challenge: Option<Challenge>,
    pub pool: PoolState,
    pub volume: u64,
    pub trades: u32,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub struct ForecastRecord {
    pub correct: u32,
    pub wrong: u32,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MarketView {
    pub id: U64,
    pub creator: AccountId,
    pub post: PostRef,
    pub claim_side: Side,
    pub rules: Rules,
    pub rules_hash: String,
    pub draft: DraftRef,
    pub creation_bond: NearToken,
    pub challenge_window_sec: u32,
    pub created_at_sec: U64,
    pub status: Status,
    pub outcome: Option<Outcome>,
    pub receipt: Option<Receipt>,
    pub challenge: Option<Challenge>,
    pub price_yes_bps: u16,
    pub pool_collateral: U128,
    pub total_yes: U128,
    pub total_no: U128,
    pub volume: U128,
    pub trades: u32,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PositionView {
    pub yes_shares: U128,
    pub no_shares: U128,
    pub yes_cost: U128,
    pub no_cost: U128,
}

impl From<Position> for PositionView {
    fn from(p: Position) -> Self {
        Self {
            yes_shares: U128(p.yes_shares),
            no_shares: U128(p.no_shares),
            yes_cost: U128(p.yes_cost_acc),
            no_cost: U128(p.no_cost_acc),
        }
    }
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Accounting {
    pub total_pool_collateral: U128,
    pub total_claimable: U128,
    pub in_flight: U128,
}
