//! Pure planning logic for `refund_v3`.
//!
//! `mode == AutoCanceled` (one side never traded, or resolver/permissionless
//! cancel). No fee — user never got a counterparty to trade against.
//!
//! **Cost-basis refund with pro-rate safety net.** Refunds user based on
//! their `cost_acc` (net collateral they paid into each side), scaled by
//! the cancel-time snapshot's `pool_collateral / Σ cost` ratio:
//!
//! ```text
//! refund = user_cost_acc × resolved_pool_collateral / resolved_x_win
//! ```
//!
//! Under **Option B (sell payout capped at proportional cost basis)** the
//! invariant `pool_collateral >= Σ remaining_cost` is guaranteed, so
//! `resolved_pool_collateral == resolved_x_win` at cancel and the pro-rate
//! reduces to `refund == user_cost_acc` — user gets exactly what they paid,
//! per side. The pro-rate math is retained as a defensive safety net so any
//! future weakening of the sell-side cap surfaces as a proportional haircut
//! rather than a stuck refund.
//!
//! Field usage from `PoolV3` at AutoCancel (see `business/resolve.rs`):
//! - `resolved_pool_collateral` — snapshot of `pool_collateral`
//! - `resolved_x_win`           — snapshot of `total_yes_cost + total_no_cost`

use crate::business::error::RefundError;
use crate::business::{mul_div, PoolSnapshot, PositionSnapshot};
use crate::state::pool_v3::ResolveModeV3;
use crate::state::Side;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RefundPlan {
    pub yes_refund: u64,
    pub no_refund: u64,
    pub total: u64,
    pub new_pool: PoolSnapshot,
    pub new_position: PositionSnapshot,
}

/// HIGH-1: `paused` is intentionally NOT accepted/checked here — refund must
/// always stay open so users can wind down even while the global circuit
/// breaker blocks new trades (see `Config.paused` doc). Only `plan_buy` /
/// `plan_sell` gate on `paused`.
pub fn plan_refund(
    pool: &PoolSnapshot,
    position: &PositionSnapshot,
) -> Result<RefundPlan, RefundError> {
    if pool.mode() != Some(ResolveModeV3::AutoCanceled) {
        return Err(RefundError::NotCancelled);
    }

    let user_cost = position
        .yes_cost_acc
        .checked_add(position.no_cost_acc)
        .ok_or(RefundError::Math)?;
    if user_cost == 0 {
        return Err(RefundError::NothingToRefund);
    }

    // Pro-rate against the cancel-time solvency snapshot. Under Option B
    // sell cap, `resolved_pool_collateral == resolved_x_win` so the ratio
    // is 1.0 and this reduces to raw cost refund.
    let total_cost_acc = pool.resolved_x_win;
    if total_cost_acc == 0 {
        return Err(RefundError::Math);
    }
    let pool_collateral_snap = pool.resolved_pool_collateral as u128;

    let yes_refund = mul_div(position.yes_cost_acc, pool_collateral_snap, total_cost_acc)
        .ok_or(RefundError::Math)?;
    let no_refund = mul_div(position.no_cost_acc, pool_collateral_snap, total_cost_acc)
        .ok_or(RefundError::Math)?;
    let total = yes_refund
        .checked_add(no_refund)
        .ok_or(RefundError::Math)?;
    if total == 0 {
        return Err(RefundError::NothingToRefund);
    }
    let total_u64 = u64::try_from(total).map_err(|_| RefundError::Math)?;
    if total_u64 > pool.pool_collateral {
        return Err(RefundError::InsufficientPoolCollateral);
    }
    let yes_refund_u64 = u64::try_from(yes_refund).map_err(|_| RefundError::Math)?;
    let no_refund_u64 = u64::try_from(no_refund).map_err(|_| RefundError::Math)?;

    let mut new_position = *position;
    new_position.yes_shares = 0;
    new_position.no_shares = 0;
    new_position.yes_cost_acc = 0;
    new_position.no_cost_acc = 0;

    // CRIT-1 fix: debit both sides' shares + cost basis from the pool
    // aggregate (refund zeroes the entire position, not just one leg) so
    // `close_pool_v3`'s gate is reachable once every AutoCanceled position
    // has refunded.
    let mut new_pool = pool.clone();
    new_pool
        .debit_collateral(total_u64)
        .ok_or(RefundError::Math)?;
    new_pool
        .debit_shares(Side::Yes, position.yes_shares)
        .ok_or(RefundError::Math)?;
    new_pool
        .debit_shares(Side::No, position.no_shares)
        .ok_or(RefundError::Math)?;
    new_pool
        .debit_cost_acc(Side::Yes, position.yes_cost_acc)
        .ok_or(RefundError::Math)?;
    new_pool
        .debit_cost_acc(Side::No, position.no_cost_acc)
        .ok_or(RefundError::Math)?;

    Ok(RefundPlan {
        yes_refund: yes_refund_u64,
        no_refund: no_refund_u64,
        total: total_u64,
        new_pool,
        new_position,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cancelled_pool() -> PoolSnapshot {
        PoolSnapshot {
            yes_shares: 1_000,
            no_shares: 0,
            pool_collateral: 900,
            total_yes_cost_acc: 800,
            total_no_cost_acc: 100,
            virtual_liquidity_l: 500_000_000,
            expiry_ts: 1_000,
            trade_freeze_seconds: 60,
            trade_fee_bps: 0,
            redeem_fee_bps: 0,
            creator_share_bps: 0,
            resolution_code: 0,
            cancelled: true,
            mode: ResolveModeV3::AutoCanceled as u8,
            // No drift: snapshot at cancel matches current pool state
            // (guaranteed under Option B sell cap) → refund == raw cost.
            resolved_pool_collateral: 900,
            resolved_x_win: 900,
            resolved_win_shares: 0,
            resolved_ts: 500,
            resolved_redeem_fee_bps: 0,
        }
    }

    #[test]
    fn refund_pays_back_full_cost_basis() {
        let pool = cancelled_pool();
        let position = PositionSnapshot {
            yes_shares: 700,
            no_shares: 0,
            yes_cost_acc: 500,
            no_cost_acc: 100,
        };
        let plan = plan_refund(&pool, &position).unwrap();
        assert_eq!(plan.yes_refund, 500);
        assert_eq!(plan.no_refund, 100);
        assert_eq!(plan.total, 600);
        assert!(plan.new_position.is_empty());
    }

    #[test]
    fn refund_rejected_when_not_cancelled() {
        let mut pool = cancelled_pool();
        pool.mode = ResolveModeV3::Unresolved as u8;
        let position = PositionSnapshot {
            yes_shares: 700,
            no_shares: 0,
            yes_cost_acc: 500,
            no_cost_acc: 0,
        };
        assert_eq!(
            plan_refund(&pool, &position),
            Err(RefundError::NotCancelled)
        );
    }

    #[test]
    fn refund_allowed_when_paused() {
        // HIGH-1: refund must stay open even while the global circuit
        // breaker (`Config.paused`) blocks new trades.
        let pool = cancelled_pool();
        let position = PositionSnapshot {
            yes_shares: 700,
            no_shares: 0,
            yes_cost_acc: 500,
            no_cost_acc: 0,
        };
        assert!(plan_refund(&pool, &position).is_ok());
    }

    #[test]
    fn refund_nothing_when_cost_zero() {
        let pool = cancelled_pool();
        let position = PositionSnapshot::default();
        assert_eq!(
            plan_refund(&pool, &position),
            Err(RefundError::NothingToRefund)
        );
    }

    #[test]
    fn refund_insufficient_pool_collateral() {
        let mut pool = cancelled_pool();
        pool.pool_collateral = 10;
        let position = PositionSnapshot {
            yes_shares: 700,
            no_shares: 0,
            yes_cost_acc: 500,
            no_cost_acc: 0,
        };
        assert_eq!(
            plan_refund(&pool, &position),
            Err(RefundError::InsufficientPoolCollateral)
        );
    }

    #[test]
    fn refund_debits_pool_collateral() {
        let pool = cancelled_pool();
        let position = PositionSnapshot {
            yes_shares: 700,
            no_shares: 0,
            yes_cost_acc: 500,
            no_cost_acc: 100,
        };
        let plan = plan_refund(&pool, &position).unwrap();
        assert_eq!(plan.new_pool.pool_collateral, 300);
    }

    #[test]
    fn refund_debits_pool_shares_and_cost() {
        // CRIT-1: refund must debit BOTH sides' shares + cost basis from the
        // pool aggregate (refund zeroes the whole position), not just
        // `pool_collateral`.
        let mut pool = cancelled_pool();
        pool.no_shares = 300;
        pool.total_no_cost_acc = 100;
        let position = PositionSnapshot {
            yes_shares: 700,
            no_shares: 300,
            yes_cost_acc: 500,
            no_cost_acc: 100,
        };
        let plan = plan_refund(&pool, &position).unwrap();
        assert_eq!(plan.new_pool.yes_shares, 300); // 1000 - 700
        assert_eq!(plan.new_pool.no_shares, 0); // 300 - 300
        assert_eq!(plan.new_pool.total_yes_cost_acc, 300); // 800 - 500
        assert_eq!(plan.new_pool.total_no_cost_acc, 0); // 100 - 100
    }

    #[test]
    fn refund_prorated_under_pool_drift_defensive() {
        // Defensive: under Option B sell cap, pool drift == 0 by invariant.
        // But if the invariant is ever weakened, pro-rate must haircut
        // rather than revert with InsufficientPoolCollateral.
        let mut pool = cancelled_pool();
        pool.total_yes_cost_acc = 900;
        pool.pool_collateral = 450;
        pool.resolved_pool_collateral = 450;
        pool.resolved_x_win = 900; // pool < total cost → haircut

        let alice = PositionSnapshot {
            yes_shares: 700,
            no_shares: 0,
            yes_cost_acc: 600,
            no_cost_acc: 0,
        };
        let bob = PositionSnapshot {
            yes_shares: 300,
            no_shares: 0,
            yes_cost_acc: 300,
            no_cost_acc: 0,
        };

        let alice_plan = plan_refund(&pool, &alice).unwrap();
        assert_eq!(alice_plan.total, 300); // 600 * 450 / 900 = 300

        let bob_plan = plan_refund(&alice_plan.new_pool, &bob).unwrap();
        assert_eq!(bob_plan.total, 150); // 300 * 450 / 900 = 150

        let total_refunded = alice_plan.total + bob_plan.total;
        assert_eq!(total_refunded, 450);
    }

    #[test]
    fn refund_zero_total_cost_acc_rejected() {
        let mut pool = cancelled_pool();
        pool.resolved_x_win = 0;
        let position = PositionSnapshot {
            yes_shares: 700,
            no_shares: 0,
            yes_cost_acc: 500,
            no_cost_acc: 0,
        };
        assert_eq!(plan_refund(&pool, &position), Err(RefundError::Math));
    }
}
