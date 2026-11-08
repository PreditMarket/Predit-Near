//! Pure planning logic for `redeem_v3`.
//!
//! Uniform-ROI (cost-weighted) payout: every winner first recovers their
//! post-fee stake (`cost_acc`, break-even), then splits the losing side's
//! collateral (`total_lose_cost = resolved_pool_collateral - resolved_x_win`)
//! proportional to their *cost basis* on the winning side —
//!
//! ```text
//! bonus  = cost_acc_win_side * total_lose_cost / resolved_x_win   (u128 floor)
//! payout = cost_acc_win_side + bonus  =  cost_acc_win_side * C / resolved_x_win
//! ```
//!
//! Every winner earns the same return-on-stake (`C / X_win`), independent of
//! how many shares the bonding curve minted them. This closes the wash-trade
//! extraction: a share-weighted split let an attacker crash the winning-side
//! price, mint cheap shares, and unwind the opposite side at break-even
//! (Semantic-B) to capture an outsized slice of the losing pot from honest
//! winners. Cost-weighting makes payout depend only on real collateral
//! staked, so curve manipulation yields no edge — it degenerates to a
//! standard cost-basis parimutuel (matching the `UniformProfit` mode name).
//! `resolved_win_shares` is retained (share ledger / events) but no longer
//! feeds payout. Full redeem only (no partial): zeroes the winning side's
//! shares + cost basis in one call. Redeem fee taken off the gross, split
//! creator/platform.

use crate::business::error::RedeemError;
use crate::business::{fee_ceil, mul_bps_floor, mul_div, PoolSnapshot, PositionSnapshot};
use crate::state::pool_v3::ResolveModeV3;
use crate::state::Side;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RedeemPlan {
    /// Cost basis burned from the winning side (`position.*_cost_acc`) —
    /// the break-even component of the cost-weighted payout.
    pub cost_acc_burned: u128,
    /// Shares burned from the winning side (`position.*_shares`) — debited
    /// from the pool aggregate so `close_pool_v3`'s winning-side-zero gate is
    /// reachable. No longer feeds payout (cost-weighted bonus).
    pub shares_burned: u128,
    /// Gross payout before redeem fee (`cost_acc_burned + bonus`).
    pub payout: u64,
    /// Total fee charged (`platform_cut + creator_cut`).
    pub fee: u64,
    /// Collateral paid out to the redeemer (`payout - fee`).
    pub net: u64,
    pub platform_cut: u64,
    pub creator_cut: u64,
    pub new_pool: PoolSnapshot,
    pub new_position: PositionSnapshot,
}

/// HIGH-1: `paused` is intentionally NOT accepted/checked here — redeem must
/// always stay open so users can wind down even while the global circuit
/// breaker blocks new trades (see `Config.paused` doc). Only `plan_buy` /
/// `plan_sell` gate on `paused`.
pub fn plan_redeem(
    pool: &PoolSnapshot,
    position: &PositionSnapshot,
    now: i64,
    claim_delay: i64,
) -> Result<RedeemPlan, RedeemError> {
    if !pool.is_resolved() {
        return Err(RedeemError::NotResolved);
    }
    let unlock = pool
        .resolved_ts
        .checked_add(claim_delay)
        .ok_or(RedeemError::Math)?;
    if now < unlock {
        return Err(RedeemError::ClaimDelayNotElapsed);
    }
    if pool.mode() != Some(ResolveModeV3::UniformProfit) {
        return Err(RedeemError::InvalidMode);
    }

    let winning_side = match pool.resolution_code {
        1 => Side::Yes,
        2 => Side::No,
        _ => return Err(RedeemError::NotResolved),
    };
    let (winning_cost_acc, winning_shares) = match winning_side {
        Side::Yes => (position.yes_cost_acc, position.yes_shares),
        Side::No => (position.no_cost_acc, position.no_shares),
    };
    if winning_cost_acc == 0 {
        return Err(RedeemError::NothingToRedeem);
    }

    // `total_lose_cost` — collateral contributed by the losing side, snapshot
    // at resolve time. Always >= 0 since `resolved_pool_collateral` includes
    // both sides' net collateral and `resolved_x_win` is only the winning
    // side's share of it.
    let lose_cost = (pool.resolved_pool_collateral as u128)
        .checked_sub(pool.resolved_x_win)
        .ok_or(RedeemError::Math)?;

    // Uniform-ROI: split the losing pot by winning-side COST BASIS, not
    // share count. `bonus = cost * lose_cost / X_win`, so
    // `payout = cost * C / X_win` — the same return for every winner,
    // independent of curve-minted shares (closes the wash-trade edge).
    // `resolved_x_win == 0` is unreachable (resolve rejects a winner with
    // zero cost basis); guarded to avoid division by zero.
    if pool.resolved_x_win == 0 {
        return Err(RedeemError::Math);
    }
    let bonus = mul_div(winning_cost_acc, lose_cost, pool.resolved_x_win).ok_or(RedeemError::Math)?;

    let payout = winning_cost_acc.checked_add(bonus).ok_or(RedeemError::Math)?;
    if payout == 0 {
        return Err(RedeemError::PayoutTooSmall);
    }
    let payout_u64 = u64::try_from(payout).map_err(|_| RedeemError::Math)?;
    if payout_u64 > pool.pool_collateral {
        return Err(RedeemError::InsufficientPoolCollateral);
    }

    // HIGH-5 fix: charge the fee snapshotted at resolve time, not the live
    // `redeem_fee_bps` — prevents admin from pumping the fee via
    // `update_pool_v3_fees` between a user's buy and their post-resolve
    // redeem.
    let fee = fee_ceil(payout_u64, pool.resolved_redeem_fee_bps).ok_or(RedeemError::Math)?;
    if fee > payout_u64 {
        return Err(RedeemError::FeeExceedsAmount);
    }
    let net = payout_u64 - fee;

    let creator_cut = mul_bps_floor(fee, pool.creator_share_bps).ok_or(RedeemError::Math)?;
    let platform_cut = fee.checked_sub(creator_cut).ok_or(RedeemError::Math)?;

    let mut new_pool = pool.clone();
    new_pool
        .debit_collateral(payout_u64)
        .ok_or(RedeemError::Math)?;
    // CRIT-1 fix: debit the winning side's shares + cost basis from the
    // pool aggregate so `close_pool_v3`'s `yes_shares == 0 && no_shares ==
    // 0` gate is actually reachable once every winner has redeemed.
    new_pool
        .debit_shares(winning_side, winning_shares)
        .ok_or(RedeemError::Math)?;
    new_pool
        .debit_cost_acc(winning_side, winning_cost_acc)
        .ok_or(RedeemError::Math)?;

    let mut new_position = *position;
    match winning_side {
        Side::Yes => {
            new_position.yes_shares = 0;
            new_position.yes_cost_acc = 0;
        }
        Side::No => {
            new_position.no_shares = 0;
            new_position.no_cost_acc = 0;
        }
    }

    Ok(RedeemPlan {
        cost_acc_burned: winning_cost_acc,
        shares_burned: winning_shares,
        payout: payout_u64,
        fee,
        net,
        platform_cut,
        creator_cut,
        new_pool,
        new_position,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const CLAIM_DELAY: i64 = 24 * 60 * 60;

    fn resolved_pool() -> PoolSnapshot {
        PoolSnapshot {
            yes_shares: 1_000,
            no_shares: 500,
            pool_collateral: 1_600,
            total_yes_cost_acc: 1_000,
            total_no_cost_acc: 600,
            virtual_liquidity_l: 500_000_000,
            expiry_ts: 1_000,
            trade_freeze_seconds: 60,
            trade_fee_bps: 0,
            redeem_fee_bps: 0,
            creator_share_bps: 0,
            resolution_code: 1, // Yes wins
            cancelled: false,
            mode: ResolveModeV3::UniformProfit as u8,
            resolved_pool_collateral: 1_600,
            resolved_x_win: 1_000,
            resolved_win_shares: 1_000, // yes_shares snapshot
            resolved_ts: 1_000,
            resolved_redeem_fee_bps: 0,
        }
    }

    fn position_with_cost(yes_cost: u128) -> PositionSnapshot {
        PositionSnapshot {
            yes_shares: 500,
            no_shares: 0,
            yes_cost_acc: yes_cost,
            no_cost_acc: 0,
        }
    }

    fn position_with(yes_cost: u128, yes_shares: u128) -> PositionSnapshot {
        PositionSnapshot {
            yes_shares,
            no_shares: 0,
            yes_cost_acc: yes_cost,
            no_cost_acc: 0,
        }
    }

    #[test]
    fn hybrid_payout_formula() {
        // pool: resolved_x_win=1000, lose_cost = 1600 - 1000 = 600.
        // Alice: cost=500 -> bonus = 500*600/1000 = 300 -> payout 800
        // (= cost * C / X_win = 500 * 1600 / 1000).
        let pool = resolved_pool();
        let position = position_with_cost(500);
        let plan = plan_redeem(&pool, &position, 1_000 + CLAIM_DELAY, CLAIM_DELAY).unwrap();
        assert_eq!(plan.payout, 800);
        assert_eq!(plan.net, 800);
        assert_eq!(plan.cost_acc_burned, 500);
        assert_eq!(plan.shares_burned, 500);
        assert_eq!(plan.new_position.yes_shares, 0);
        assert_eq!(plan.new_position.yes_cost_acc, 0);
    }

    #[test]
    fn uniform_roi_same_cost_same_payout_regardless_of_shares() {
        // Alice and Bob paid the SAME cost (500 each) but hold DIFFERENT
        // shares (300 vs 700). Under cost-weighting they must be paid
        // IDENTICALLY — share count no longer affects payout (this is what
        // kills the wash-trade edge).
        let mut pool = resolved_pool();
        pool.resolved_x_win = 1_000; // Alice cost 500 + Bob cost 500
        pool.resolved_win_shares = 1_000; // vestigial for payout now
        pool.resolved_pool_collateral = 1_600; // lose_cost = 600

        let alice = plan_redeem(&pool, &position_with(500, 300), 1_000 + CLAIM_DELAY, CLAIM_DELAY).unwrap();
        let bob = plan_redeem(&pool, &position_with(500, 700), 1_000 + CLAIM_DELAY, CLAIM_DELAY).unwrap();

        // bonus = 500*600/1000 = 300 -> payout 800 for BOTH.
        assert_eq!(alice.payout, 800);
        assert_eq!(bob.payout, 800);
        assert_eq!(alice.payout, bob.payout, "same cost -> same payout, shares irrelevant");
        assert_eq!(alice.payout + bob.payout, 1_600); // conserves C_snap exactly here
    }

    #[test]
    fn uniform_roi_payout_scales_with_cost_not_shares() {
        // "Whale" holds many shares for little cost; "retail" holds few
        // shares for high cost (the exact profile a wash-trader manufactures).
        // Cost-weighting pays strictly by cost: the whale — who staked LESS —
        // must get the SMALLER payout, and both earn the identical ROI.
        let mut pool = resolved_pool();
        pool.resolved_x_win = 1_000;
        pool.resolved_win_shares = 1_000;
        pool.resolved_pool_collateral = 1_600; // C/X_win = 1.6x for everyone

        let whale = plan_redeem(&pool, &position_with(200, 800), 1_000 + CLAIM_DELAY, CLAIM_DELAY).unwrap();
        let retail = plan_redeem(&pool, &position_with(800, 200), 1_000 + CLAIM_DELAY, CLAIM_DELAY).unwrap();

        // whale  = 200 * 1600 / 1000 = 320
        // retail = 800 * 1600 / 1000 = 1280
        assert_eq!(whale.payout, 320);
        assert_eq!(retail.payout, 1_280);
        assert!(
            retail.payout > whale.payout,
            "the winner who staked more must be paid more"
        );
        // Identical ROI: payout / cost == C / X_win == 1.6 for both.
        assert_eq!(whale.payout * 800, retail.payout * 200, "equal return-on-stake");
    }

    #[test]
    fn hybrid_no_loss_guarantee() {
        // Worst case: a winner holding the minimum possible share of
        // resolved_win_shares still recovers at least their cost_acc
        // (bonus is always >= 0, never negative).
        let pool = resolved_pool();
        let position = position_with(500, 1); // negligible shares
        let plan = plan_redeem(&pool, &position, 1_000 + CLAIM_DELAY, CLAIM_DELAY).unwrap();
        assert!(plan.payout >= 500, "payout {} must be >= cost_acc 500", plan.payout);
    }

    #[test]
    fn hybrid_solvency() {
        // Four winners whose shares sum to resolved_win_shares (1000) and
        // whose cost_acc sums to resolved_x_win (1000). Floor division on
        // each individual bonus can only lose dust, never overshoot — sum
        // of payouts must stay <= resolved_pool_collateral.
        let pool = resolved_pool(); // resolved_pool_collateral=1600, x_win=1000, win_shares=1000
        let winners = [(100u128, 111u128), (200, 222), (300, 333), (400, 334)];
        let mut total_payout: u64 = 0;
        for (cost, shares) in winners {
            let plan = plan_redeem(
                &pool,
                &position_with(cost, shares),
                1_000 + CLAIM_DELAY,
                CLAIM_DELAY,
            )
            .unwrap();
            total_payout += plan.payout;
        }
        assert!(
            total_payout <= pool.resolved_pool_collateral,
            "total payout {total_payout} must not exceed pool collateral {}",
            pool.resolved_pool_collateral
        );
        // Cost basis alone (break-even) must always be covered.
        assert!(total_payout >= 1_000);
    }

    #[test]
    fn redeem_before_claim_delay_rejected() {
        let pool = resolved_pool();
        let position = position_with_cost(500);
        assert_eq!(
            plan_redeem(&pool, &position, 1_000, CLAIM_DELAY),
            Err(RedeemError::ClaimDelayNotElapsed)
        );
    }

    #[test]
    fn redeem_unresolved_pool_rejected() {
        let mut pool = resolved_pool();
        pool.resolution_code = 0;
        let position = position_with_cost(500);
        assert_eq!(
            plan_redeem(&pool, &position, 1_000 + CLAIM_DELAY, CLAIM_DELAY),
            Err(RedeemError::NotResolved)
        );
    }

    #[test]
    fn redeem_allowed_when_paused() {
        // HIGH-1: redeem must stay open even while the global circuit
        // breaker (`Config.paused`) blocks new trades — `plan_redeem` no
        // longer accepts/checks a `paused` flag at all.
        let pool = resolved_pool();
        let position = position_with_cost(500);
        assert!(plan_redeem(&pool, &position, 1_000 + CLAIM_DELAY, CLAIM_DELAY).is_ok());
    }

    #[test]
    fn redeem_wrong_mode_rejected() {
        let mut pool = resolved_pool();
        pool.mode = ResolveModeV3::AutoCanceled as u8;
        let position = position_with_cost(500);
        assert_eq!(
            plan_redeem(&pool, &position, 1_000 + CLAIM_DELAY, CLAIM_DELAY),
            Err(RedeemError::InvalidMode)
        );
    }

    #[test]
    fn redeem_nothing_to_redeem_when_cost_zero() {
        let pool = resolved_pool();
        let position = position_with_cost(0);
        assert_eq!(
            plan_redeem(&pool, &position, 1_000 + CLAIM_DELAY, CLAIM_DELAY),
            Err(RedeemError::NothingToRedeem)
        );
    }

    #[test]
    fn redeem_charges_resolved_fee_snapshot_not_live_fee() {
        // HIGH-5 regression: `plan_redeem` must charge the fee locked in at
        // resolve time (`resolved_redeem_fee_bps`), never whatever
        // `redeem_fee_bps` happens to be live on the snapshot handed in —
        // closes the front-run window where an admin bumps the redeem fee
        // between a user's buy and the market resolving.
        let mut pool = resolved_pool();
        pool.resolved_redeem_fee_bps = 50; // 0.5% — locked in at resolve time
        pool.redeem_fee_bps = 5_000; // 50% — live field has since drifted
        let position = position_with_cost(500);
        let plan = plan_redeem(&pool, &position, 1_000 + CLAIM_DELAY, CLAIM_DELAY).unwrap();
        let expected_fee = fee_ceil(plan.payout, 50).unwrap();
        assert_eq!(plan.fee, expected_fee);
        assert!(plan.fee < plan.payout / 10, "fee must reflect the 0.5% snapshot, not the 50% live value");
    }

    #[test]
    fn redeem_fee_split_between_creator_and_platform() {
        let mut pool = resolved_pool();
        pool.resolved_redeem_fee_bps = 100; // 1% — fee compute reads the snapshot
        pool.creator_share_bps = 4_000; // 40%
        let position = position_with_cost(500);
        let plan = plan_redeem(&pool, &position, 1_000 + CLAIM_DELAY, CLAIM_DELAY).unwrap();
        assert_eq!(plan.fee, plan.platform_cut + plan.creator_cut);
        assert_eq!(plan.net, plan.payout - plan.fee);
    }

    #[test]
    fn redeem_losing_side_cost_untouched() {
        let pool = resolved_pool();
        let mut position = position_with_cost(500);
        position.no_cost_acc = 200; // losing side stake, must survive
        let plan = plan_redeem(&pool, &position, 1_000 + CLAIM_DELAY, CLAIM_DELAY).unwrap();
        assert_eq!(plan.new_position.no_cost_acc, 200);
    }

    #[test]
    fn redeem_debits_pool_shares_and_cost() {
        // CRIT-1: redeem must debit the winning side's shares + cost basis
        // from the pool aggregate, not just `pool_collateral`.
        let pool = resolved_pool(); // yes_shares=1000, total_yes_cost_acc=1000
        let position = position_with(500, 500); // cost=500, shares=500
        let plan = plan_redeem(&pool, &position, 1_000 + CLAIM_DELAY, CLAIM_DELAY).unwrap();
        assert_eq!(plan.new_pool.yes_shares, 500); // 1000 - 500
        assert_eq!(plan.new_pool.total_yes_cost_acc, 500); // 1000 - 500
        // Losing side untouched.
        assert_eq!(plan.new_pool.no_shares, pool.no_shares);
        assert_eq!(plan.new_pool.total_no_cost_acc, pool.total_no_cost_acc);
    }

    #[test]
    fn full_lifecycle_close_pool_reachable() {
        // Alice (300/300) and Bob (700/700) together make up the entire
        // winning side (resolved_win_shares=1000, resolved_x_win=1000).
        // Redeem them sequentially, threading the pool snapshot from one
        // call into the next (as would happen on-chain, one tx per user) —
        // after both redeem, pool.yes_shares and total_yes_cost_acc must
        // converge to exactly 0, satisfying `close_pool_v3`'s gate for the
        // winning side.
        let pool = resolved_pool(); // resolved_win_shares=1000, resolved_x_win=1000
        let alice = position_with(300, 300);
        let bob = position_with(700, 700);

        let alice_plan =
            plan_redeem(&pool, &alice, 1_000 + CLAIM_DELAY, CLAIM_DELAY).unwrap();
        let bob_plan = plan_redeem(
            &alice_plan.new_pool,
            &bob,
            1_000 + CLAIM_DELAY,
            CLAIM_DELAY,
        )
        .unwrap();

        assert_eq!(bob_plan.new_pool.yes_shares, 0);
        assert_eq!(bob_plan.new_pool.total_yes_cost_acc, 0);
        // Losing side is untouched by winner redeems — a separate,
        // pre-existing architectural limit on `close_pool_v3` reachability
        // for two-sided (UniformProfit) markets, outside CRIT-1's scope.
        assert_eq!(bob_plan.new_pool.no_shares, pool.no_shares);
    }

    #[test]
    fn redeem_uniform_roi_ignores_entry_price_no_sells() {
        // Uniform-ROI: two winners who staked the SAME cost are paid the
        // SAME, regardless of entry price / share count. Neither loses.
        //
        // Scenario (no sells):
        //   Alice YES cost=500 shs=750 (early, 0.67 per share)
        //   Bob   YES cost=500 shs=583 (late, 0.86 per share)
        //   Charlie NO cost=500 (loser)
        // At resolve YES:
        //   pool=1500, X_win=1000, lose_cost=500, win_shares=1333.
        let mut pool = resolved_pool();
        pool.pool_collateral = 1_500;
        pool.yes_shares = 1_333;
        pool.total_yes_cost_acc = 1_000;
        pool.total_no_cost_acc = 500;
        pool.resolved_pool_collateral = 1_500;
        pool.resolved_x_win = 1_000;
        pool.resolved_win_shares = 1_333;

        let alice = PositionSnapshot {
            yes_shares: 750,
            no_shares: 0,
            yes_cost_acc: 500,
            no_cost_acc: 0,
        };
        let bob = PositionSnapshot {
            yes_shares: 583,
            no_shares: 0,
            yes_cost_acc: 500,
            no_cost_acc: 0,
        };

        let alice_plan =
            plan_redeem(&pool, &alice, 1_000 + CLAIM_DELAY, CLAIM_DELAY).unwrap();
        let bob_plan =
            plan_redeem(&pool, &bob, 1_000 + CLAIM_DELAY, CLAIM_DELAY).unwrap();

        // Both winners break even or better — never lose.
        assert!(alice_plan.payout >= 500, "alice lost: payout={}", alice_plan.payout);
        assert!(bob_plan.payout >= 500, "bob (late) lost: payout={}", bob_plan.payout);

        // Same cost -> same payout. Entry price / share count no longer
        // changes the outcome (this is what removes the wash-trade edge).
        // Each: 500 * 1500 / 1000 = 750.
        assert_eq!(alice_plan.payout, 750);
        assert_eq!(bob_plan.payout, 750);
        assert_eq!(
            alice_plan.payout, bob_plan.payout,
            "uniform ROI: equal cost -> equal payout regardless of shares"
        );
    }

    #[test]
    fn redeem_winner_absorbs_early_sellers_forfeited_curve_gain() {
        // Option B: when an early buyer sells (capped at cost), the curve
        // gain they'd have taken WITHOUT the cap stays in the pool as
        // backing for remaining winners. Sole remaining YES holder should
        // therefore collect BOTH the loser side AND Alice's forfeited
        // curve profit → strictly bigger than the plain "cost + loser"
        // Hybrid payout.
        //
        // Post-sell snapshot: Alice sold at cap 500 (curve wanted ~629).
        //   pool_collateral = 1000 (500 Bob + 500 Charlie NO, Alice net 0)
        //   yes_shares = 583 (Bob only)
        //   total_yes_cost_acc = 500 (Bob)
        //   no shares/cost = 500 (Charlie)
        let mut pool = resolved_pool();
        pool.pool_collateral = 1_000;
        pool.yes_shares = 583;
        pool.total_yes_cost_acc = 500;
        pool.total_no_cost_acc = 500;
        pool.resolved_pool_collateral = 1_000;
        pool.resolved_x_win = 500;
        pool.resolved_win_shares = 583;

        let bob = PositionSnapshot {
            yes_shares: 583,
            no_shares: 0,
            yes_cost_acc: 500,
            no_cost_acc: 0,
        };
        let bob_plan =
            plan_redeem(&pool, &bob, 1_000 + CLAIM_DELAY, CLAIM_DELAY).unwrap();

        // Bob nhận toàn bộ pool: cost 500 + bonus 500 = 1000.
        // In "no-sell" world he'd only get 500 + fewer_bonus. Cap redistribution
        // gave him more because Alice forfeited her curve gain.
        assert_eq!(bob_plan.payout, 1_000);
        // Bob paid 500 → profit +500.
        assert!(bob_plan.payout > bob.yes_cost_acc as u64);
    }

    #[test]
    fn redeem_underflow_when_pool_drained_below_winner_cost() {
        // Defensive regression lock. Under Option B (sell payout capped at
        // proportional cost basis) this poisoned snapshot state should be
        // unreachable by legitimate execution — every sell debits pool by
        // <= cost_removed, so `pool_collateral >= Σ remaining_cost` holds
        // as invariant. This test manually constructs the underflow input
        // to lock the failure mode: if the invariant is ever weakened, the
        // formula must surface `RedeemError::Math` rather than silently
        // corrupting payouts.
        //
        // Reproduction (pre-resolve trades, symbolic numbers, no fee):
        //   t0: Alice buys YES 500  → pool=500,  yes_cost=500, yes_shs=750
        //   t1: Bob   buys YES 500  → pool=1000, yes_cost=1000, yes_shs=1333
        //                              (Bob got 583 shs — curve moved)
        //   t2: Alice sells ALL YES → curve pays her ≈629.5 (profit ~130
        //                              extracted from Bob's slippage)
        //                              pool=370.5, yes_cost=500 (Bob only,
        //                              Alice's 500 debited proportional),
        //                              yes_shs=583 (Bob only)
        //   t3: Charlie buys NO 100 → pool=470.5, no_cost=100, no_shs=324
        //                              (both sides now have cost > 0 so the
        //                              AutoCancel gate at resolve does NOT
        //                              fire — falls into UniformProfit)
        //   t4: expiry, resolve YES
        //
        // Snapshot at resolve:
        //   resolved_pool_collateral = 470   (C_snap, floor'd for u128)
        //   resolved_x_win           = 500   (Bob's remaining yes cost)
        //   resolved_win_shares      = 583   (Bob's yes shares)
        //
        // Hybrid needs `lose_cost = C_snap - X_win = -30` → `checked_sub`
        // returns None → `plan_redeem` errors `Math` → Bob CANNOT redeem
        // → funds stuck. This test locks that failure mode so any resolve-
        // side fix (fallback to AutoCancel, pro-rate rescue, etc.) has to
        // be a conscious behavior change, not a silent regression.
        let mut pool = resolved_pool();
        pool.pool_collateral = 470;
        pool.yes_shares = 583;
        pool.no_shares = 324;
        pool.total_yes_cost_acc = 500;
        pool.total_no_cost_acc = 100;
        pool.resolved_pool_collateral = 470;
        pool.resolved_x_win = 500; // > C_snap → insolvent
        pool.resolved_win_shares = 583;

        // Bob is the only winner-side holder — never sold.
        let bob = PositionSnapshot {
            yes_shares: 583,
            no_shares: 0,
            yes_cost_acc: 500,
            no_cost_acc: 0,
        };

        assert_eq!(
            plan_redeem(&pool, &bob, 1_000 + CLAIM_DELAY, CLAIM_DELAY),
            Err(RedeemError::Math),
            "insolvent pool must NOT silently pay out; requires resolve-time fallback",
        );
    }
}
