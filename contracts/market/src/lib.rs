//! Social prediction markets on NEAR.
//!
//! A market is created from a post: its rules are locked at creation against a
//! bond and people bet USDC on it. After expiry NEAR AI reads the source named
//! in the rules, a person confirms that reading, and the operator posts it as a
//! receipt with evidence. Anyone can challenge a receipt for a bond, an arbiter
//! decides, and finalizing opens redemption and updates the post author's
//! forecasting record. The AI never settles a market on its own.
//!
//! Market maths live in `predit-core`.
//! This crate only loads state, runs a `plan_*` and moves tokens.
//!
//! Token transfers are asynchronous, so state is always updated first. A
//! transfer that fails is credited to `claimable` rather than rolled back.

mod types;

#[cfg(test)]
mod tests;

pub use types::*;

use near_contract_standards::fungible_token::core::ext_ft_core;
use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_sdk::json_types::{U128, U64};
use near_sdk::store::{IterableSet, LookupMap, LookupSet};
use near_sdk::{
    assert_one_yocto, env, near, require, serde_json, AccountId, BorshStorageKey, Gas, NearToken,
    PanicOnDefault, Promise, PromiseError, PromiseOrValue,
};
use predit_core::business::buy::plan_buy;
use predit_core::business::redeem::plan_redeem;
use predit_core::business::refund::plan_refund;
use predit_core::business::resolve::plan_resolve;
use predit_core::business::sell::plan_sell;
use predit_core::business::{PoolSnapshot, PositionSnapshot};
use predit_core::math::cpmm;
use predit_core::state::pool_v3::ResolveModeV3;

const GAS_FT_TRANSFER: Gas = Gas::from_tgas(20);
const GAS_ON_PAYOUT: Gas = Gas::from_tgas(15);
const MIN_PAYOUT_GAS: Gas = Gas::from_tgas(60);
const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);
/// Kept free at all times so that a failed payout can always be recorded.
const NEAR_RESERVE: NearToken = NearToken::from_near(1);
/// Kept free even by receipts and challenges, so a failed payout is recorded.
const PAYOUT_FLOOR: NearToken = NearToken::from_millinear(100);
/// Expiry cannot be further out than this.
const MAX_EXPIRY_HORIZON_SEC: u64 = 10 * 365 * 24 * 60 * 60;
const MAX_FEE_BPS: u16 = 5_000;
const MAX_SHARE_BPS: u16 = 10_000;

const MAX_LABEL: usize = 40;
const MAX_SHORT_TEXT: usize = 200;
const MAX_LONG_TEXT: usize = 600;

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Markets,
    Positions,
    ByPost,
    ByUser,
    Claimable,
    Records,
    CountedPosts,
    Open,
    AwaitingFinalize,
    /// Claim records, written straight to storage: the contract struct (and so
    /// the deployed state layout) is unchanged.
    Claims,
}

#[near(serializers = [json])]
#[derive(Debug)]
#[serde(tag = "action", rename_all = "snake_case")]
enum FtMessage {
    Buy { market_id: U64, side: Side, min_shares: U128 },
}

#[near(event_json(standard = "predit"))]
pub enum Event {
    #[event_version("1.0.0")]
    MarketCreated { market_id: U64, creator: AccountId, post_id: String, rules_hash: String },
    #[event_version("1.0.0")]
    Trade { market_id: U64, account: AccountId, side: Side, buy: bool, amount: U128, price_yes_bps: u16 },
    #[event_version("1.0.0")]
    ReceiptPosted { market_id: U64, outcome: Outcome },
    #[event_version("1.0.0")]
    Challenged { market_id: U64, challenger: AccountId },
    #[event_version("1.0.0")]
    Finalized { market_id: U64, outcome: Outcome },
    #[event_version("1.0.0")]
    Cancelled { market_id: U64 },
    #[event_version("1.0.0")]
    PayoutFailed { account: AccountId, amount: U128 },
}

#[derive(PanicOnDefault)]
#[near(contract_state)]
pub struct Contract {
    owner: AccountId,
    operator: AccountId,
    arbiter: AccountId,
    treasury: AccountId,
    collateral: AccountId,
    config: Config,
    paused: bool,
    next_id: u64,
    markets: LookupMap<u64, Market>,
    positions: LookupMap<(u64, AccountId), Position>,
    by_post: LookupMap<String, Vec<u64>>,
    by_user: LookupMap<AccountId, Vec<u64>>,
    claimable: LookupMap<AccountId, u128>,
    records: LookupMap<String, ForecastRecord>,
    counted_posts: LookupSet<String>,
    open: IterableSet<u64>,
    awaiting_finalize: IterableSet<u64>,
    total_pool_collateral: u128,
    total_claimable: u128,
    in_flight: u128,
    /// NEAR held for creation and challenge bonds. Storage may not eat into it.
    bonds_outstanding: u128,
}

#[near]
impl Contract {
    #[init]
    pub fn new(
        owner: AccountId,
        operator: AccountId,
        arbiter: AccountId,
        treasury: AccountId,
        collateral: AccountId,
        config: Option<Config>,
    ) -> Self {
        let config = config.unwrap_or_default();
        validate_config(&config);
        require!(operator != arbiter, "Operator and arbiter must differ");
        Self {
            owner,
            operator,
            arbiter,
            treasury,
            collateral,
            config,
            paused: false,
            next_id: 0,
            markets: LookupMap::new(StorageKey::Markets),
            positions: LookupMap::new(StorageKey::Positions),
            by_post: LookupMap::new(StorageKey::ByPost),
            by_user: LookupMap::new(StorageKey::ByUser),
            claimable: LookupMap::new(StorageKey::Claimable),
            records: LookupMap::new(StorageKey::Records),
            counted_posts: LookupSet::new(StorageKey::CountedPosts),
            open: IterableSet::new(StorageKey::Open),
            awaiting_finalize: IterableSet::new(StorageKey::AwaitingFinalize),
            total_pool_collateral: 0,
            total_claimable: 0,
            in_flight: 0,
            bonds_outstanding: 0,
        }
    }

    // ---- create -----------------------------------------------------------

    /// Locks the rules. Attach the creation bond plus the storage cost; any
    /// excess is refunded. No liquidity is needed: the price curve is virtual.
    #[payable]
    pub fn create_market(
        &mut self,
        post: PostRef,
        claim_side: Side,
        rules: Rules,
        draft: DraftRef,
        challenge_window_sec: Option<u32>,
    ) -> U64 {
        require!(!self.paused, "Paused");
        validate_text(&post, &rules, &draft);

        let now = now_sec();
        let expiry = rules.expiry_sec.0;
        require!(
            expiry > now + self.config.trade_freeze_sec as u64,
            "Expiry is too soon"
        );
        require!(expiry <= now + MAX_EXPIRY_HORIZON_SEC, "Expiry is too far out");

        let window = challenge_window_sec.unwrap_or(self.config.default_challenge_window_sec);
        require!(
            window >= self.config.min_challenge_window_sec
                && window <= self.config.max_challenge_window_sec,
            "Challenge window out of range"
        );

        let mut on_post = self.by_post.get(&post.post_id).cloned().unwrap_or_default();
        require!(
            on_post.len() < self.config.max_markets_per_post as usize,
            "Too many markets on this post"
        );

        let storage_before = env::storage_usage();
        let id = self.next_id;
        self.next_id += 1;

        let rules_hash = env::sha256(&near_sdk::borsh::to_vec(&rules).expect("borsh"));
        let hash_hex = hex(&rules_hash);
        let post_id = post.post_id.clone();
        let creator = env::predecessor_account_id();
        let bond = self.config.creation_bond;

        on_post.push(id);
        self.by_post.insert(post_id.clone(), on_post);
        self.open.insert(id);

        let pool = PoolState {
            yes_shares: 0,
            no_shares: 0,
            pool_collateral: 0,
            total_yes_cost_acc: 0,
            total_no_cost_acc: 0,
            virtual_liquidity_l: self.config.virtual_liquidity_l.0,
            expiry_ts: expiry as i64,
            trade_freeze_seconds: self.config.trade_freeze_sec,
            trade_fee_bps: self.config.trade_fee_bps,
            redeem_fee_bps: self.config.redeem_fee_bps,
            creator_share_bps: self.config.creator_share_bps,
            resolution_code: 0,
            cancelled: false,
            mode: ResolveModeV3::Unresolved as u8,
            resolved_pool_collateral: 0,
            resolved_x_win: 0,
            resolved_win_shares: 0,
            resolved_ts: 0,
            resolved_redeem_fee_bps: 0,
        };

        self.markets.insert(
            id,
            Market {
                id,
                creator: creator.clone(),
                post,
                claim_side,
                rules,
                rules_hash,
                draft,
                creation_bond: bond,
                challenge_window_sec: window,
                created_at_sec: now,
                status: Status::Open,
                outcome: None,
                receipt: None,
                challenge: None,
                pool,
                volume: 0,
                trades: 0,
            },
        );
        self.markets.flush();
        self.by_post.flush();
        self.open.flush();

        let used = env::storage_usage().saturating_sub(storage_before);
        let required = bond.saturating_add(env::storage_byte_cost().saturating_mul(used as u128));
        let attached = env::attached_deposit();
        require!(
            attached >= required,
            format!("Attach at least {} yoctoNEAR", required.as_yoctonear())
        );
        let excess = attached.saturating_sub(required);
        if !excess.is_zero() {
            let _ = Promise::new(creator.clone()).transfer(excess);
        }
        self.bonds_outstanding += bond.as_yoctonear();

        Event::MarketCreated { market_id: U64(id), creator, post_id, rules_hash: hash_hex }.emit();
        U64(id)
    }

    // ---- trade ------------------------------------------------------------

    /// Sells at cost basis, as in V3: the curve only sets the displayed price.
    #[payable]
    pub fn sell(&mut self, market_id: U64, side: Side, shares: U128, min_out: U128) -> Promise {
        assert_one_yocto();
        require_payout_gas();
        let account = env::predecessor_account_id();
        let mut market = self.market(market_id.0);
        require!(market.status == Status::Open, "Market is not open");

        let key = (market_id.0, account.clone());
        let position = self.position(&key);
        let plan = plan_sell(
            &PoolSnapshot::from(&market.pool),
            &PositionSnapshot::from(position),
            side.into(),
            to_u64(shares.0),
            now_sec() as i64,
            self.paused,
        )
        .unwrap_or_else(|e| fail(format!("{e:?}")));
        require!(plan.net_out as u128 >= min_out.0, "Slippage");
        require!(plan.net_out > 0, "Nothing to pay out");

        market.pool = plan.new_pool.into();
        market.volume = market.volume.saturating_add(plan.gross);
        market.trades = market.trades.saturating_add(1);
        self.total_pool_collateral -= plan.gross as u128;
        let creator = market.creator.clone();
        self.credit(&creator, plan.creator_cut as u128);
        let treasury = self.treasury.clone();
        self.credit(&treasury, plan.platform_cut as u128);
        self.store_position(key, plan.new_position);

        Event::Trade {
            market_id,
            account: account.clone(),
            side,
            buy: false,
            amount: U128(plan.gross as u128),
            price_yes_bps: price_yes_bps(&market.pool),
        }
        .emit();
        self.markets.insert(market_id.0, market);
        self.pay(account, plan.net_out as u128)
    }

    // ---- resolution -------------------------------------------------------

    /// Posts the confirmed result of a market, or declares it invalid. The
    /// outcome only takes effect once the challenge window has passed.
    pub fn post_receipt(&mut self, market_id: U64, report: Report, evidence: Evidence) {
        require!(env::predecessor_account_id() == self.operator, "Operator only");
        require!(
            evidence.hash.len() <= MAX_SHORT_TEXT && evidence.uri.len() <= MAX_LONG_TEXT,
            "Evidence is too long"
        );
        if let Some(ai) = &evidence.ai {
            require!(
                !ai.model.is_empty()
                    && !ai.chat_id.is_empty()
                    && !ai.signed_text.is_empty()
                    && !ai.signature.is_empty()
                    && !ai.signing_address.is_empty(),
                "The AI reading is incomplete"
            );
            require!(
                ai.model.len() <= MAX_SHORT_TEXT
                    && ai.chat_id.len() <= MAX_SHORT_TEXT
                    && ai.signed_text.len() <= MAX_LONG_TEXT
                    && ai.signature.len() <= MAX_SHORT_TEXT
                    && ai.signing_address.len() <= MAX_SHORT_TEXT,
                "Evidence is too long"
            );
        }
        require!(!evidence.uri.trim().is_empty(), "Evidence is required");
        require!(is_sha256_hex(&evidence.hash), "Evidence hash must be a sha256 hex digest");
        let mut market = self.market(market_id.0);
        require!(market.status == Status::Open, "Market is not open");
        let now = now_sec();
        let expiry = market.rules.expiry_sec.0;
        require!(now >= expiry, "Market has not expired");

        let (outcome, reason) = match report {
            Report::Proposed { outcome, reason } => {
                require!(evidence.ai.is_some(), "A NEAR AI reading is required");
                let outcome = if outcome == Side::Yes { Outcome::Yes } else { Outcome::No };
                (outcome, reason)
            }
            Report::Invalid { kind, reason } => (Outcome::Invalid(kind), reason),
        };
        require!(!reason.trim().is_empty() && reason.len() <= MAX_LONG_TEXT, "A reason is required");

        market.receipt = Some(Receipt { outcome, reason, evidence, posted_at_sec: U64(now) });
        market.status = Status::ReceiptPosted;
        self.markets.insert(market_id.0, market);
        self.open.remove(&market_id.0);
        self.awaiting_finalize.insert(market_id.0);
        self.assert_near_cover(NearToken::from_yoctonear(0), PAYOUT_FLOOR);
        Event::ReceiptPosted { market_id, outcome }.emit();
    }

    /// Disputes a receipt inside its window. Attach the challenge bond.
    #[payable]
    pub fn challenge(&mut self, market_id: U64, reason_uri: String) {
        require!(reason_uri.len() <= MAX_LONG_TEXT, "Reason is too long");
        let mut market = self.market(market_id.0);
        require!(market.status == Status::ReceiptPosted, "No receipt to challenge");
        let posted = receipt_of(&market).posted_at_sec.0;
        let now = now_sec();
        require!(now < posted + market.challenge_window_sec as u64, "Challenge window is over");

        let bond = self.config.challenge_bond;
        let attached = env::attached_deposit();
        require!(attached >= bond, "Attach the challenge bond");
        let challenger = env::predecessor_account_id();
        require!(
            challenger != self.arbiter && challenger != self.operator,
            "The operator and the arbiter cannot challenge"
        );
        let excess = attached.saturating_sub(bond);
        if !excess.is_zero() {
            let _ = Promise::new(challenger.clone()).transfer(excess);
        }

        market.challenge = Some(Challenge {
            challenger: challenger.clone(),
            bond,
            reason_uri,
            at_sec: U64(now),
        });
        market.status = Status::Challenged;
        self.markets.insert(market_id.0, market);
        self.bonds_outstanding += bond.as_yoctonear();
        self.assert_near_cover(excess, PAYOUT_FLOOR);
        Event::Challenged { market_id, challenger }.emit();
    }

    pub fn arbitrate(&mut self, market_id: U64, decision: Decision) {
        require!(env::predecessor_account_id() == self.arbiter, "Arbiter only");
        let market = self.market(market_id.0);
        require!(market.status == Status::Challenged, "Nothing to arbitrate");
        let posted = receipt_of(&market).outcome;
        match decision {
            Decision::Uphold => self.settle(market, posted, Some(false)),
            Decision::Overturn(outcome) => {
                require!(outcome != posted, "Overturn must change the outcome");
                self.settle(market, outcome, Some(true))
            }
        }
    }

    /// Anyone, once the challenge window has passed without a dispute.
    pub fn finalize(&mut self, market_id: U64) {
        let market = self.market(market_id.0);
        require!(market.status == Status::ReceiptPosted, "Nothing to finalize");
        let receipt = receipt_of(&market);
        require!(
            now_sec() >= receipt.posted_at_sec.0 + market.challenge_window_sec as u64,
            "Challenge window is still open"
        );
        let outcome = receipt.outcome;
        self.settle(market, outcome, None);
    }

    // ---- cancel -----------------------------------------------------------

    /// By the owner at any time, or by the creator before the first trade.
    pub fn cancel_market(&mut self, market_id: U64) {
        let caller = env::predecessor_account_id();
        let market = self.market(market_id.0);
        require!(market.status == Status::Open, "Market is not open");
        require!(
            caller == self.owner || (caller == market.creator && market.trades == 0),
            "Not allowed"
        );
        self.cancel(market);
    }

    /// Anyone, when a role has gone silent, so funds can never be trapped. A
    /// silent operator cancels the market. A silent arbiter leaves the receipt
    /// standing, counted from the challenge, so a challenge cannot void a result.
    pub fn claim_stuck(&mut self, market_id: U64) {
        let market = self.market(market_id.0);
        let now = now_sec();
        let wait = self.config.stuck_after_sec as u64;
        match market.status {
            Status::Open => {
                require!(now >= market.rules.expiry_sec.0 + wait, "Too early");
                self.cancel(market);
            }
            Status::Challenged => {
                let challenged_at = market.challenge.as_ref().map_or(0, |c| c.at_sec.0);
                require!(now >= challenged_at + wait, "Too early");
                let outcome = receipt_of(&market).outcome;
                self.settle(market, outcome, None);
            }
            _ => fail("Market is not stuck".to_string()),
        }
    }

    // ---- payouts ----------------------------------------------------------

    #[payable]
    pub fn redeem(&mut self, market_id: U64) -> Promise {
        assert_one_yocto();
        require_payout_gas();
        let account = env::predecessor_account_id();
        let mut market = self.market(market_id.0);
        require!(market.status == Status::Finalized, "Market is not finalized");

        let key = (market_id.0, account.clone());
        let position = self.position(&key);
        let plan = plan_redeem(
            &PoolSnapshot::from(&market.pool),
            &PositionSnapshot::from(position),
            now_sec() as i64,
            0,
        )
        .unwrap_or_else(|e| fail(format!("{e:?}")));

        market.pool = plan.new_pool.into();
        self.total_pool_collateral -= plan.payout as u128;
        let creator = market.creator.clone();
        self.credit(&creator, plan.creator_cut as u128);
        let treasury = self.treasury.clone();
        self.credit(&treasury, plan.platform_cut as u128);
        self.record_claim(market_id.0, &account, ClaimKind::Redeem, position, plan.net as u128);
        self.store_position(key, plan.new_position);
        self.markets.insert(market_id.0, market);
        self.pay(account, plan.net as u128)
    }

    /// Returns the stake in a cancelled, invalid or one-sided market. No fee.
    #[payable]
    pub fn refund(&mut self, market_id: U64) -> Promise {
        assert_one_yocto();
        require_payout_gas();
        let account = env::predecessor_account_id();
        let mut market = self.market(market_id.0);
        require!(
            matches!(market.status, Status::Finalized | Status::Cancelled),
            "Market is still running"
        );

        let key = (market_id.0, account.clone());
        let position = self.position(&key);
        let plan = plan_refund(&PoolSnapshot::from(&market.pool), &PositionSnapshot::from(position))
            .unwrap_or_else(|e| fail(format!("{e:?}")));

        market.pool = plan.new_pool.into();
        self.total_pool_collateral -= plan.total as u128;
        self.record_claim(market_id.0, &account, ClaimKind::Refund, position, plan.total as u128);
        self.store_position(key, plan.new_position);
        self.markets.insert(market_id.0, market);
        self.pay(account, plan.total as u128)
    }

    /// Pays out fees earned and any transfer that failed earlier.
    #[payable]
    pub fn withdraw(&mut self) -> Promise {
        assert_one_yocto();
        require_payout_gas();
        let account = env::predecessor_account_id();
        let amount = self.claimable.get(&account).copied().unwrap_or(0);
        require!(amount > 0, "Nothing to withdraw");
        self.claimable.remove(&account);
        self.total_claimable -= amount;
        self.pay(account, amount)
    }

    /// Runs after each payout. A failed transfer stays claimable.
    #[private]
    pub fn on_payout(
        &mut self,
        account: AccountId,
        amount: U128,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> bool {
        self.in_flight -= amount.0;
        if result.is_ok() {
            return true;
        }
        self.credit(&account, amount.0);
        Event::PayoutFailed { account, amount }.emit();
        false
    }

    // ---- admin ------------------------------------------------------------

    pub fn set_paused(&mut self, paused: bool) {
        self.assert_owner();
        self.paused = paused;
    }

    /// Parameters for markets created from now on; existing markets keep the bond,
    /// window and fees they were created with. The demo sets the creation bond to 0.
    pub fn set_config(&mut self, config: Config) {
        self.assert_owner();
        validate_config(&config);
        self.config = config;
    }

    pub fn set_roles(
        &mut self,
        operator: Option<AccountId>,
        arbiter: Option<AccountId>,
        treasury: Option<AccountId>,
    ) {
        self.assert_owner();
        if let Some(a) = operator {
            self.operator = a;
        }
        if let Some(a) = arbiter {
            self.arbiter = a;
        }
        if let Some(a) = treasury {
            self.treasury = a;
        }
        require!(self.operator != self.arbiter, "Operator and arbiter must differ");
    }

    // ---- views ------------------------------------------------------------

    pub fn get_config(&self) -> Config {
        self.config.clone()
    }

    pub fn get_roles(&self) -> (AccountId, AccountId, AccountId, AccountId, AccountId) {
        (
            self.owner.clone(),
            self.operator.clone(),
            self.arbiter.clone(),
            self.treasury.clone(),
            self.collateral.clone(),
        )
    }

    pub fn is_paused(&self) -> bool {
        self.paused
    }

    pub fn get_market(&self, market_id: U64) -> Option<MarketView> {
        self.markets.get(&market_id.0).map(view_of)
    }

    pub fn get_markets(&self, from: Option<U64>, limit: Option<u32>) -> Vec<MarketView> {
        let start = from.map_or(0, |v| v.0);
        let limit = limit.unwrap_or(20).min(100) as u64;
        (start..self.next_id.min(start.saturating_add(limit)))
            .filter_map(|id| self.markets.get(&id).map(view_of))
            .collect()
    }

    /// Markets per post id, so a feed page needs a single call.
    pub fn get_markets_for_posts(&self, post_ids: Vec<String>) -> Vec<(String, Vec<MarketView>)> {
        post_ids
            .into_iter()
            .take(100)
            .map(|post_id| {
                let markets = self
                    .by_post
                    .get(&post_id)
                    .map(|ids| {
                        ids.iter().filter_map(|id| self.markets.get(id).map(view_of)).collect()
                    })
                    .unwrap_or_default();
                (post_id, markets)
            })
            .collect()
    }

    pub fn get_position(&self, market_id: U64, account_id: AccountId) -> PositionView {
        self.positions
            .get(&(market_id.0, account_id))
            .copied()
            .unwrap_or_default()
            .into()
    }

    pub fn get_user_markets(
        &self,
        account_id: AccountId,
        from: Option<u32>,
        limit: Option<u32>,
    ) -> Vec<(MarketView, PositionView)> {
        let from = from.unwrap_or(0) as usize;
        let limit = limit.unwrap_or(50).min(100) as usize;
        self.by_user
            .get(&account_id)
            .map(|ids| {
                ids.iter()
                    .skip(from)
                    .take(limit)
                    .filter_map(|id| {
                        let market = self.markets.get(id)?;
                        let position = self
                            .positions
                            .get(&(*id, account_id.clone()))
                            .copied()
                            .unwrap_or_default();
                        Some((view_of(market), position.into()))
                    })
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Payouts this account took, per market, with the position it held then.
    /// Redeemed and refunded positions are emptied, so this is their history.
    pub fn get_user_claims(&self, account_id: AccountId) -> Vec<(U64, ClaimView)> {
        self.by_user
            .get(&account_id)
            .map(|ids| {
                ids.iter()
                    .filter_map(|id| self.claim(*id, &account_id).map(|c| (U64(*id), c.into())))
                    .collect()
            })
            .unwrap_or_default()
    }

    pub fn get_record(&self, author_ref: String) -> ForecastRecord {
        self.records.get(&author_ref).copied().unwrap_or_default()
    }

    pub fn get_claimable(&self, account_id: AccountId) -> U128 {
        U128(self.claimable.get(&account_id).copied().unwrap_or(0))
    }

    /// Expired markets among `limit` open markets starting at `from_index`.
    /// Page through `get_open_count` to see them all.
    pub fn get_due_markets(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<MarketView> {
        let now = now_sec();
        self.open
            .iter()
            .skip(from_index.unwrap_or(0) as usize)
            .take(limit.unwrap_or(50).min(100) as usize)
            .filter_map(|id| self.markets.get(id))
            .filter(|m| now >= m.rules.expiry_sec.0)
            .map(view_of)
            .collect()
    }

    pub fn get_open_count(&self) -> u32 {
        self.open.len()
    }

    /// Finalizable receipts among `limit` entries starting at `from_index`.
    pub fn get_finalizable(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<U64> {
        let now = now_sec();
        self.awaiting_finalize
            .iter()
            .skip(from_index.unwrap_or(0) as usize)
            .take(limit.unwrap_or(50).min(100) as usize)
            .filter_map(|id| self.markets.get(id))
            .filter(|m| {
                m.status == Status::ReceiptPosted
                    && now >= receipt_of(m).posted_at_sec.0 + m.challenge_window_sec as u64
            })
            .map(|m| U64(m.id))
            .collect()
    }

    pub fn get_awaiting_finalize_count(&self) -> u32 {
        self.awaiting_finalize.len()
    }

    /// NEAR available for storage, beyond bonds and the reserve. Top it up by
    /// sending NEAR to the contract when it runs low.
    pub fn get_free_near(&self) -> NearToken {
        self.account_near()
            .saturating_sub(self.storage_near())
            .saturating_sub(NearToken::from_yoctonear(self.bonds_outstanding))
            .saturating_sub(NEAR_RESERVE)
    }

    /// The contract must hold at least the sum of these in collateral.
    pub fn get_accounting(&self) -> Accounting {
        Accounting {
            total_pool_collateral: U128(self.total_pool_collateral),
            total_claimable: U128(self.total_claimable),
            in_flight: U128(self.in_flight),
        }
    }
}

#[near]
impl FungibleTokenReceiver for Contract {
    /// Bets arrive as `ft_transfer_call`. Panicking refunds the sender.
    fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        require!(env::predecessor_account_id() == self.collateral, "Wrong token");
        let message: FtMessage =
            serde_json::from_str(&msg).unwrap_or_else(|_| fail("Invalid message".to_string()));
        match message {
            FtMessage::Buy { market_id, side, min_shares } => {
                self.buy(sender_id, market_id, side, to_u64(amount.0), min_shares.0)
            }
        }
        PromiseOrValue::Value(U128(0))
    }
}

impl Contract {
    fn buy(&mut self, buyer: AccountId, market_id: U64, side: Side, amount: u64, min_shares: u128) {
        let mut market = self.market(market_id.0);
        require!(market.status == Status::Open, "Market is not open");
        require!(amount >= self.config.min_buy.0, "Below the minimum buy");

        let key = (market_id.0, buyer.clone());
        let position = self.position(&key);
        let plan = plan_buy(
            &PoolSnapshot::from(&market.pool),
            &PositionSnapshot::from(position),
            side.into(),
            amount,
            now_sec() as i64,
            self.paused,
        )
        .unwrap_or_else(|e| fail(format!("{e:?}")));
        require!(plan.delta_shares as u128 >= min_shares, "Slippage");

        market.pool = plan.new_pool.into();
        market.volume = market.volume.saturating_add(amount);
        market.trades = market.trades.saturating_add(1);
        self.total_pool_collateral += plan.net_c as u128;
        let creator = market.creator.clone();
        self.credit(&creator, plan.creator_cut as u128);
        let treasury = self.treasury.clone();
        self.credit(&treasury, plan.platform_cut as u128);
        self.positions.insert(key, plan.new_position.into());

        let mut ids = self.by_user.get(&buyer).cloned().unwrap_or_default();
        if !ids.contains(&market_id.0) {
            ids.push(market_id.0);
            self.by_user.insert(buyer.clone(), ids);
        }

        Event::Trade {
            market_id,
            account: buyer,
            side,
            buy: true,
            amount: U128(amount as u128),
            price_yes_bps: price_yes_bps(&market.pool),
        }
        .emit();
        self.markets.insert(market_id.0, market);
        self.assert_near_cover(NearToken::from_yoctonear(0), NEAR_RESERVE);
    }

    /// Ends a market: settles the pool, then the bonds, then the record.
    /// `challenge_won` is `None` when nobody ruled on the challenge, either
    /// because there was none or because the arbiter stayed silent.
    fn settle(&mut self, mut market: Market, outcome: Outcome, challenge_won: Option<bool>) {
        let now = now_sec() as i64;
        let two_sided = market.pool.total_yes_cost_acc > 0 && market.pool.total_no_cost_acc > 0;

        match outcome {
            Outcome::Yes | Outcome::No => {
                let side = if outcome == Outcome::Yes { Side::Yes } else { Side::No };
                let plan = plan_resolve(&PoolSnapshot::from(&market.pool), side.into(), now, 0)
                    .unwrap_or_else(|e| fail(format!("{e:?}")));
                market.pool = plan.new_pool.into();
                if two_sided && self.counted_posts.insert(market.post.post_id.clone()) {
                    let mut record =
                        self.records.get(&market.post.author_ref).copied().unwrap_or_default();
                    if side == market.claim_side {
                        record.correct += 1;
                    } else {
                        record.wrong += 1;
                    }
                    self.records.insert(market.post.author_ref.clone(), record);
                }
            }
            Outcome::Invalid(_) => cancel_pool(&mut market.pool, now),
        }

        let bond = market.creation_bond;
        self.bonds_outstanding -= bond.as_yoctonear();
        // A market created without a bond has nothing to move.
        if !bond.is_zero() {
            let to = match (outcome, challenge_won, &market.challenge) {
                (Outcome::Invalid(InvalidKind::AmbiguousRules), Some(true), Some(c)) => c.challenger.clone(),
                (Outcome::Invalid(InvalidKind::AmbiguousRules), _, _) => self.treasury.clone(),
                _ => market.creator.clone(),
            };
            let _ = Promise::new(to).transfer(bond);
        }

        if let Some(c) = &market.challenge {
            // Only a ruling against the challenger forfeits the bond.
            let to = if challenge_won == Some(false) {
                self.treasury.clone()
            } else {
                c.challenger.clone()
            };
            self.bonds_outstanding -= c.bond.as_yoctonear();
            let _ = Promise::new(to).transfer(c.bond);
        }

        market.status = Status::Finalized;
        market.outcome = Some(outcome);
        let id = market.id;
        self.markets.insert(id, market);
        self.awaiting_finalize.remove(&id);
        Event::Finalized { market_id: U64(id), outcome }.emit();
    }

    fn cancel(&mut self, mut market: Market) {
        cancel_pool(&mut market.pool, now_sec() as i64);
        self.bonds_outstanding -= market.creation_bond.as_yoctonear();
        if !market.creation_bond.is_zero() {
            let _ = Promise::new(market.creator.clone()).transfer(market.creation_bond);
        }
        if let Some(c) = &market.challenge {
            self.bonds_outstanding -= c.bond.as_yoctonear();
            let _ = Promise::new(c.challenger.clone()).transfer(c.bond);
        }
        market.status = Status::Cancelled;
        let id = market.id;
        // A cancelled market no longer takes up one of the post's slots.
        if let Some(ids) = self.by_post.get_mut(&market.post.post_id) {
            ids.retain(|m| *m != id);
        }
        self.markets.insert(id, market);
        self.open.remove(&id);
        self.awaiting_finalize.remove(&id);
        Event::Cancelled { market_id: U64(id) }.emit();
    }

    fn market(&self, id: u64) -> Market {
        self.markets.get(&id).cloned().unwrap_or_else(|| fail("Market not found".to_string()))
    }

    fn position(&self, key: &(u64, AccountId)) -> Position {
        self.positions.get(key).copied().unwrap_or_default()
    }

    fn store_position(&mut self, key: (u64, AccountId), position: PositionSnapshot) {
        if position.is_empty() {
            self.positions.remove(&key);
        } else {
            self.positions.insert(key, position.into());
        }
    }

    fn claim_key(market_id: u64, account: &AccountId) -> Vec<u8> {
        let mut key = near_sdk::borsh::to_vec(&StorageKey::Claims).expect("key");
        key.extend(near_sdk::borsh::to_vec(&(market_id, account)).expect("key"));
        key
    }

    fn claim(&self, market_id: u64, account: &AccountId) -> Option<ClaimRecord> {
        env::storage_read(&Self::claim_key(market_id, account))
            .map(|bytes| near_sdk::borsh::from_slice(&bytes).expect("claim record"))
    }

    /// Payouts never wait on storage: a record replaces the position it
    /// empties, about the same size. A later claim on the same market adds up.
    fn record_claim(&mut self, market_id: u64, account: &AccountId, kind: ClaimKind, position: Position, payout: u128) {
        let record = match self.claim(market_id, account) {
            Some(earlier) => ClaimRecord {
                kind,
                position: Position {
                    yes_shares: earlier.position.yes_shares.max(position.yes_shares),
                    no_shares: earlier.position.no_shares.max(position.no_shares),
                    yes_cost_acc: earlier.position.yes_cost_acc.max(position.yes_cost_acc),
                    no_cost_acc: earlier.position.no_cost_acc.max(position.no_cost_acc),
                },
                payout: earlier.payout.saturating_add(payout),
                at_sec: now_sec(),
            },
            None => ClaimRecord { kind, position, payout, at_sec: now_sec() },
        };
        env::storage_write(
            &Self::claim_key(market_id, account),
            &near_sdk::borsh::to_vec(&record).expect("claim record"),
        );
    }

    fn credit(&mut self, account: &AccountId, amount: u128) {
        if amount == 0 {
            return;
        }
        let balance = self.claimable.get(account).copied().unwrap_or(0);
        self.claimable.insert(account.clone(), balance + amount);
        self.total_claimable += amount;
    }

    fn pay(&mut self, account: AccountId, amount: u128) -> Promise {
        self.in_flight += amount;
        ext_ft_core::ext(self.collateral.clone())
            .with_attached_deposit(ONE_YOCTO)
            .with_static_gas(GAS_FT_TRANSFER)
            .ft_transfer(account.clone(), U128(amount), None)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_ON_PAYOUT)
                    .on_payout(account, U128(amount)),
            )
    }

    fn account_near(&self) -> NearToken {
        env::account_balance()
    }

    fn storage_near(&self) -> NearToken {
        env::storage_byte_cost().saturating_mul(env::storage_usage() as u128)
    }

    /// Bets, receipts and challenges grow storage nobody pays for directly.
    /// They stop before touching NEAR held for bonds, and `keep` stays free for
    /// recording failed payouts. Bets keep the larger amount, so filling the
    /// contract with positions can never block a receipt or a challenge.
    /// `leaving` is NEAR in the balance that is about to be refunded.
    fn assert_near_cover(&mut self, leaving: NearToken, keep: NearToken) {
        self.markets.flush();
        self.positions.flush();
        self.by_user.flush();
        self.claimable.flush();
        self.open.flush();
        self.awaiting_finalize.flush();
        let needed = self
            .storage_near()
            .saturating_add(NearToken::from_yoctonear(self.bonds_outstanding))
            .saturating_add(keep)
            .saturating_add(leaving);
        require!(self.account_near() >= needed, "The contract needs more NEAR for storage");
    }

    fn assert_owner(&self) {
        require!(env::predecessor_account_id() == self.owner, "Owner only");
    }
}

/// Same effect as V3's cancel: everyone refunds at cost through `plan_refund`.
fn cancel_pool(pool: &mut PoolState, now: i64) {
    pool.cancelled = true;
    pool.mode = ResolveModeV3::AutoCanceled as u8;
    pool.resolved_pool_collateral = pool.pool_collateral;
    pool.resolved_x_win = pool.total_yes_cost_acc + pool.total_no_cost_acc;
    pool.resolved_ts = pool.resolved_ts.max(now);
}

fn price_yes_bps(pool: &PoolState) -> u16 {
    let Ok((r_y, r_n)) =
        cpmm::compute_reserves(pool.yes_shares, pool.no_shares, pool.virtual_liquidity_l as u128)
    else {
        return 5_000;
    };
    let total = r_y + r_n;
    if total == 0 {
        return 5_000;
    }
    u16::try_from(cpmm::mul_div_u128(r_n, 10_000, total).unwrap_or(5_000)).unwrap_or(5_000)
}

fn view_of(m: &Market) -> MarketView {
    MarketView {
        id: U64(m.id),
        creator: m.creator.clone(),
        post: m.post.clone(),
        claim_side: m.claim_side,
        rules: m.rules.clone(),
        rules_hash: hex(&m.rules_hash),
        draft: m.draft.clone(),
        creation_bond: m.creation_bond,
        challenge_window_sec: m.challenge_window_sec,
        created_at_sec: U64(m.created_at_sec),
        status: m.status,
        outcome: m.outcome,
        receipt: m.receipt.clone(),
        challenge: m.challenge.clone(),
        price_yes_bps: price_yes_bps(&m.pool),
        pool_collateral: U128(m.pool.pool_collateral as u128),
        total_yes: U128(m.pool.total_yes_cost_acc),
        total_no: U128(m.pool.total_no_cost_acc),
        volume: U128(m.volume as u128),
        trades: m.trades,
        yes_shares: U128(m.pool.yes_shares),
        no_shares: U128(m.pool.no_shares),
        virtual_liquidity_l: U128(m.pool.virtual_liquidity_l as u128),
        trade_fee_bps: m.pool.trade_fee_bps,
        redeem_fee_bps: m.pool.redeem_fee_bps,
        creator_share_bps: m.pool.creator_share_bps,
        trade_freeze_sec: m.pool.trade_freeze_seconds,
        refunds_only: m.pool.mode == ResolveModeV3::AutoCanceled as u8,
        resolved_pool_collateral: U128(m.pool.resolved_pool_collateral as u128),
        resolved_x_win: U128(m.pool.resolved_x_win),
        resolved_ts: U64(m.pool.resolved_ts.max(0) as u64),
        resolved_redeem_fee_bps: m.pool.resolved_redeem_fee_bps,
    }
}

fn receipt_of(market: &Market) -> &Receipt {
    market.receipt.as_ref().unwrap_or_else(|| fail("No receipt".to_string()))
}

fn validate_config(c: &Config) {
    require!(
        c.trade_fee_bps <= MAX_FEE_BPS && c.redeem_fee_bps <= MAX_FEE_BPS,
        "Fee is too high"
    );
    require!(c.creator_share_bps <= MAX_SHARE_BPS, "Creator share is too high");
    require!(
        c.min_challenge_window_sec > 0
            && c.min_challenge_window_sec <= c.default_challenge_window_sec
            && c.default_challenge_window_sec <= c.max_challenge_window_sec,
        "Challenge windows are inconsistent"
    );
    require!(c.virtual_liquidity_l.0 >= 1_000_000, "Virtual liquidity is too low");
    require!(c.max_markets_per_post > 0, "Markets per post must be positive");
    require!(c.min_buy.0 > 0, "Minimum buy must be positive");
}

fn validate_text(post: &PostRef, rules: &Rules, draft: &DraftRef) {
    let short = [
        &post.source,
        &post.post_id,
        &post.author_ref,
        &rules.question,
        &rules.resolution_source,
        &rules.image_url,
        &draft.model,
        &draft.chat_id,
    ];
    let long = [
        &post.text,
        &rules.description,
        &rules.yes_condition,
        &rules.no_condition,
        &rules.invalid_conditions,
    ];
    let labels = [&rules.yes_label, &rules.no_label, &rules.category];
    require!(short.iter().all(|s| s.len() <= MAX_SHORT_TEXT), "Text is too long");
    require!(long.iter().all(|s| s.len() <= MAX_LONG_TEXT), "Text is too long");
    require!(labels.iter().all(|s| s.len() <= MAX_LABEL), "Label is too long");
    require!(
        !post.post_id.is_empty() && !post.author_ref.is_empty() && !rules.question.is_empty(),
        "Missing post or question"
    );
    require!(
        !rules.yes_label.is_empty() && !rules.no_label.is_empty() && rules.yes_label != rules.no_label,
        "Two different outcome labels are required"
    );
    require!(!rules.resolution_source.trim().is_empty(), "A resolution source is required");
    require!(
        rules.resolution_source.starts_with("https://"),
        "The resolution source must be an https URL"
    );
    require!(
        !rules.yes_condition.trim().is_empty()
            && !rules.no_condition.trim().is_empty()
            && !rules.invalid_conditions.trim().is_empty(),
        "Conditions cannot be blank"
    );
    require!(
        rules.image_url.is_empty() || rules.image_url.starts_with("https://"),
        "Image must be an https URL"
    );
}

fn is_sha256_hex(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit())
}

fn require_payout_gas() {
    require!(env::prepaid_gas() >= MIN_PAYOUT_GAS, "Attach more gas");
}

fn now_sec() -> u64 {
    env::block_timestamp_ms() / 1000
}

fn to_u64(value: u128) -> u64 {
    u64::try_from(value).unwrap_or_else(|_| fail("Amount is too large".to_string()))
}

fn fail(message: String) -> ! {
    env::panic_str(&message)
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
