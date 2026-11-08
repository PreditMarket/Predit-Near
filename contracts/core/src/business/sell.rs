//! Pure planning logic for the sell side of `swap_v3`.
//!
//! Adding `shares_in` back to the pool and re-solving the invariant yields
//! `gross_out`. The seller's cost basis scales down proportionally and the
//! pool's aggregate cost basis is debited by the same amount so
//! `Σ user.cost_acc == pool.total_cost_acc` stays exact.

use crate::business::error::SellError;
use crate::business::{fee_ceil, mul_bps_floor, PoolSnapshot, PositionSnapshot};
use crate::state::Side;

/// Result of planning a v3 sell — apply `new_pool`/`new_position` back onto
/// the live accounts, then CPI `net_out` out and direct-transfer
/// `platform_cut`/`creator_cut` from the pool vault.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SellPlan {
    /// Gross collateral released by the curve before fee.
    pub gross: u64,
    /// Total fee charged (`platform_cut + creator_cut`).
    pub fee: u64,
    /// Collateral paid out to the seller (`gross - fee`).
    pub net_out: u64,
    pub platform_cut: u64,
    pub creator_cut: u64,
    pub new_pool: PoolSnapshot,
    pub new_position: PositionSnapshot,
}

pub fn plan_sell(
    pool: &PoolSnapshot,
    position: &PositionSnapshot,
    side: Side,
    shares_in: u64,
    now: i64,
    paused: bool,
) -> Result<SellPlan, SellError> {
    pool.check_trade_allowed(now, paused)?;
    if shares_in == 0 {
        return Err(SellError::ZeroAmount);
    }
    let shares_in_u128 = shares_in as u128;

    let user_holds = match side {
        Side::Yes => position.yes_shares,
        Side::No => position.no_shares,
    };
    if user_holds < shares_in_u128 {
        return Err(SellError::InsufficientShares);
    }

    // Semantic B: sell payout = proportional cost basis. Deterministic
    // exit-at-cost — trader always gets back exactly what they put in for
    // the shares they sell. Curve state is NOT consulted for sell payout
    // (curve is only the price signal for BUY). Solvency invariant
    // `pool_collateral >= Σ remaining_cost` holds by construction because
    // pool debit == cost debit on every sell.
    //
    // Rationale vs Semantic A (min(curve, cost)):
    //   - Semantic A: user takes curve risk on sell — adverse curve moves
    //     yield payout < cost (loss). Preserves curve pricing signal.
    //   - Semantic B: user takes zero sell risk — always break-even.
    //     Trades off pricing signal for UX exit-safety.
    let user_cost = match side {
        Side::Yes => position.yes_cost_acc,
        Side::No => position.no_cost_acc,
    };
    // Proportional cost debit — same formula PositionSnapshot::debit_proportional
    // will apply below (peek here to compute payout).
    let cost_removed = crate::business::mul_div(user_cost, shares_in_u128, user_holds)
        .ok_or(SellError::Math)?;
    let gross_effective = u64::try_from(cost_removed).map_err(|_| SellError::Math)?;

    if gross_effective == 0 {
        return Err(SellError::PayoutTooSmall);
    }
    if gross_effective > pool.pool_collateral {
        return Err(SellError::InsufficientPoolCollateral);
    }

    let fee = fee_ceil(gross_effective, pool.trade_fee_bps).ok_or(SellError::Math)?;
    if fee > gross_effective {
        return Err(SellError::FeeExceedsAmount);
    }
    let net_out = gross_effective - fee;

    let mut new_pool = pool.clone();
    new_pool
        .debit_shares(side, shares_in_u128)
        .ok_or(SellError::Math)?;
    new_pool
        .debit_collateral(gross_effective)
        .ok_or(SellError::Math)?;

    let mut new_position = *position;
    let cost_removed_check = new_position
        .debit_proportional(side, shares_in_u128)
        .ok_or(SellError::Math)?;
    // Defensive: peek must match live mutation. Should be identical since
    // both use mul_div with the same inputs.
    debug_assert_eq!(cost_removed_check, cost_removed);
    new_pool
        .debit_cost_acc(side, cost_removed)
        .ok_or(SellError::Math)?;

    let creator_cut = mul_bps_floor(fee, pool.creator_share_bps).ok_or(SellError::Math)?;
    let platform_cut = fee.checked_sub(creator_cut).ok_or(SellError::Math)?;

    Ok(SellPlan {
        gross: gross_effective,
        fee,
        net_out,
        platform_cut,
        creator_cut,
        new_pool,
        new_position,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::business::buy::plan_buy;

    fn fresh_pool() -> PoolSnapshot {
        PoolSnapshot {
            yes_shares: 0,
            no_shares: 0,
            pool_collateral: 0,
            total_yes_cost_acc: 0,
            total_no_cost_acc: 0,
            virtual_liquidity_l: 500_000_000,
            expiry_ts: 1_000_000,
            trade_freeze_seconds: 60,
            trade_fee_bps: 0,
            redeem_fee_bps: 0,
            creator_share_bps: 0,
            resolution_code: 0,
            cancelled: false,
            mode: 0,
            resolved_pool_collateral: 0,
            resolved_x_win: 0,
            resolved_win_shares: 0,
            resolved_ts: 0,
            resolved_redeem_fee_bps: 0,
        }
    }

    /// Buys a small amount on the opposite side so `total_*_cost_acc` is
    /// non-zero for both sides — the gate `plan_sell` (MED-1) requires
    /// before allowing a sell on `side`.
    fn seed_counter_side(pool: &PoolSnapshot, side: Side) -> PoolSnapshot {
        let counter_side = match side {
            Side::Yes => Side::No,
            Side::No => Side::Yes,
        };
        plan_buy(pool, &PositionSnapshot::default(), counter_side, 1_000, 0, false)
            .unwrap()
            .new_pool
    }

    #[test]
    fn sell_scales_cost_acc_and_round_trips() {
        let pool = seed_counter_side(&fresh_pool(), Side::Yes);
        let position = PositionSnapshot::default();

        let buy_plan = plan_buy(&pool, &position, Side::Yes, 500_000_000, 0, false).unwrap();
        let sell_plan = plan_sell(
            &buy_plan.new_pool,
            &buy_plan.new_position,
            Side::Yes,
            buy_plan.delta_shares,
            0,
            false,
        )
        .unwrap();

        assert_eq!(sell_plan.fee, 0);
        let diff = if sell_plan.net_out > 500_000_000 {
            sell_plan.net_out - 500_000_000
        } else {
            500_000_000 - sell_plan.net_out
        };
        assert!(diff <= 2, "round trip dust too large: {diff}");
        assert_eq!(sell_plan.new_pool.yes_shares, 0);
        assert_eq!(sell_plan.new_pool.total_yes_cost_acc, 0);
        assert_eq!(sell_plan.new_position.yes_shares, 0);
        assert_eq!(sell_plan.new_position.yes_cost_acc, 0);
    }

    #[test]
    fn sell_more_than_owned_errors() {
        let pool = fresh_pool();
        let position = PositionSnapshot::default();
        let buy_plan = plan_buy(&pool, &position, Side::Yes, 500_000_000, 0, false).unwrap();
        assert_eq!(
            plan_sell(
                &buy_plan.new_pool,
                &buy_plan.new_position,
                Side::Yes,
                buy_plan.delta_shares + 1,
                0,
                false,
            ),
            Err(SellError::InsufficientShares)
        );
    }

    #[test]
    fn pool_cost_acc_matches_sum_of_users_after_partial_sell() {
        let pool = seed_counter_side(&fresh_pool(), Side::Yes);
        let position = PositionSnapshot::default();
        let buy_plan = plan_buy(&pool, &position, Side::Yes, 500_000_000, 0, false).unwrap();
        let sell_plan = plan_sell(
            &buy_plan.new_pool,
            &buy_plan.new_position,
            Side::Yes,
            buy_plan.delta_shares / 2,
            0,
            false,
        )
        .unwrap();
        assert_eq!(
            sell_plan.new_pool.total_yes_cost_acc,
            sell_plan.new_position.yes_cost_acc
        );
    }

    #[test]
    fn sell_zero_amount_rejected() {
        let pool = fresh_pool();
        let position = PositionSnapshot::default();
        assert_eq!(
            plan_sell(&pool, &position, Side::Yes, 0, 0, false),
            Err(SellError::ZeroAmount)
        );
    }

    #[test]
    fn sell_paused_rejected() {
        let pool = fresh_pool();
        let mut position = PositionSnapshot::default();
        position.yes_shares = 100;
        assert_eq!(
            plan_sell(&pool, &position, Side::Yes, 10, 0, true),
            Err(SellError::Paused)
        );
    }

    #[test]
    fn sell_rejected_when_cancelled() {
        let mut pool = fresh_pool();
        pool.cancelled = true;
        let mut position = PositionSnapshot::default();
        position.yes_shares = 100;
        assert_eq!(
            plan_sell(&pool, &position, Side::Yes, 10, 0, false),
            Err(SellError::AlreadyCancelled)
        );
    }

    #[test]
    fn sell_fee_split_between_creator_and_platform() {
        let mut pool = seed_counter_side(&fresh_pool(), Side::Yes);
        pool.trade_fee_bps = 100; // 1%
        pool.creator_share_bps = 2_500; // 25%
        let position = PositionSnapshot::default();
        let buy_plan = plan_buy(&pool, &position, Side::Yes, 500_000_000, 0, false).unwrap();

        let sell_plan = plan_sell(
            &buy_plan.new_pool,
            &buy_plan.new_position,
            Side::Yes,
            buy_plan.delta_shares,
            0,
            false,
        )
        .unwrap();
        assert_eq!(sell_plan.fee, sell_plan.platform_cut + sell_plan.creator_cut);
        assert!(sell_plan.creator_cut <= sell_plan.fee);
    }

    #[test]
    fn sell_allowed_when_counter_side_has_zero_cost() {
        // MED-1 gate removed: solo-side buyer can round-trip via sell.
        // Curve trades against the virtual reserve on the empty side —
        // round-trip nets ~cost (small dust). Safety is now enforced at
        // refund time by cost-pro-rata `plan_refund`, not by this gate.
        let pool = fresh_pool();
        let position = PositionSnapshot::default();
        let buy_plan = plan_buy(&pool, &position, Side::Yes, 500_000_000, 0, false).unwrap();
        let sell_plan = plan_sell(
            &buy_plan.new_pool,
            &buy_plan.new_position,
            Side::Yes,
            buy_plan.delta_shares,
            0,
            false,
        )
        .unwrap();
        let diff = if sell_plan.net_out > 500_000_000 {
            sell_plan.net_out - 500_000_000
        } else {
            500_000_000 - sell_plan.net_out
        };
        assert!(diff <= 2, "solo round-trip dust too large: {diff}");
    }

    #[test]
    fn sell_insufficient_pool_collateral_when_pool_underfunded() {
        let mut pool = seed_counter_side(&fresh_pool(), Side::Yes);
        let position = PositionSnapshot::default();
        let buy_plan = plan_buy(&pool, &position, Side::Yes, 500_000_000, 0, false).unwrap();
        pool = buy_plan.new_pool;
        pool.pool_collateral = 1; // drain pool artificially
        assert_eq!(
            plan_sell(
                &pool,
                &buy_plan.new_position,
                Side::Yes,
                buy_plan.delta_shares,
                0,
                false,
            ),
            Err(SellError::InsufficientPoolCollateral)
        );
    }

    #[test]
    fn sell_returns_exact_cost_when_early_buyer_pushed_curve() {
        // Semantic B: early buyer cannot extract curve slippage profit —
        // payout equals proportional cost basis EXACTLY (not up-to-cost as
        // in Semantic A). Extra curve gain stays in pool as backing.
        let pool = fresh_pool();
        let position = PositionSnapshot::default();

        let alice_buy = plan_buy(&pool, &position, Side::Yes, 500_000_000, 0, false).unwrap();
        let bob_buy = plan_buy(
            &alice_buy.new_pool,
            &PositionSnapshot::default(),
            Side::Yes,
            500_000_000,
            0,
            false,
        )
        .unwrap();

        let alice_sell = plan_sell(
            &bob_buy.new_pool,
            &alice_buy.new_position,
            Side::Yes,
            alice_buy.delta_shares,
            0,
            false,
        )
        .unwrap();

        assert_eq!(
            alice_sell.net_out, 500_000_000,
            "Semantic B: payout must equal cost exactly"
        );
    }

    #[test]
    fn sell_returns_exact_cost_when_late_buyer_would_lose_under_semantic_a() {
        // Semantic B key benefit — late buyer sells after adverse curve
        // move and STILL recovers full cost. Under Semantic A curve gross
        // would be ~370 for the same setup → user would lose ~130.
        let pool = fresh_pool();
        let position = PositionSnapshot::default();

        // Alice early buy.
        let alice_buy = plan_buy(&pool, &position, Side::Yes, 500_000_000, 0, false).unwrap();
        // Bob late buy — pays higher per-share price.
        let bob_buy = plan_buy(
            &alice_buy.new_pool,
            &PositionSnapshot::default(),
            Side::Yes,
            500_000_000,
            0,
            false,
        )
        .unwrap();
        // Alice sells first — Semantic B pays her exact cost (500).
        let alice_sell = plan_sell(
            &bob_buy.new_pool,
            &alice_buy.new_position,
            Side::Yes,
            alice_buy.delta_shares,
            0,
            false,
        )
        .unwrap();
        // Bob now sells into a curve that has swung back → under Semantic A
        // the curve gross (~370) < cost (500) → Bob would lose. Under
        // Semantic B, payout = cost exactly regardless of curve state.
        let bob_sell = plan_sell(
            &alice_sell.new_pool,
            &bob_buy.new_position,
            Side::Yes,
            bob_buy.delta_shares,
            0,
            false,
        )
        .unwrap();

        assert_eq!(
            bob_sell.net_out, 500_000_000,
            "Semantic B guarantee: late buyer recovers exact cost, no loss"
        );

        // Pool fully drained (both sides refunded their cost).
        assert_eq!(bob_sell.new_pool.pool_collateral, 0);
        assert_eq!(bob_sell.new_pool.total_yes_cost_acc, 0);
    }
}
