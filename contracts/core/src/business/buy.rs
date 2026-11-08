//! Pure planning logic for the buy side of `swap_v3`.
//!
//! `net_c = collateral_in - fee` (fee ceil'd) flows into the constant-product
//! curve `R_y * R_n = L^2`, minting `Δy` shares. Both the position's and
//! pool's `*_cost_acc` are credited by `net_c` — the basis for cost-basis
//! parimutuel payout at resolve. Fee is split creator/platform here — both
//! cuts are direct-transfer amounts the handler CPIs out immediately (no
//! on-pool accrual).

use crate::business::error::BuyError;
use crate::business::{fee_ceil, mul_bps_floor, PoolSnapshot, PositionSnapshot};
use crate::math::cpmm;
use crate::state::Side;

/// Result of planning a v3 buy — apply `new_pool`/`new_position` back onto
/// the live accounts, then CPI `net_c = collateral_in - fee` in and
/// direct-transfer `platform_cut`/`creator_cut` out of the pool vault.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BuyPlan {
    /// Shares minted (`Δy`).
    pub delta_shares: u64,
    /// Collateral net of fee that entered the curve.
    pub net_c: u64,
    /// Total fee charged (`platform_cut + creator_cut`).
    pub fee: u64,
    pub platform_cut: u64,
    pub creator_cut: u64,
    pub new_pool: PoolSnapshot,
    pub new_position: PositionSnapshot,
}

pub fn plan_buy(
    pool: &PoolSnapshot,
    position: &PositionSnapshot,
    side: Side,
    collateral_in: u64,
    now: i64,
    paused: bool,
) -> Result<BuyPlan, BuyError> {
    pool.check_trade_allowed(now, paused)?;
    if collateral_in == 0 {
        return Err(BuyError::ZeroAmount);
    }

    let fee = fee_ceil(collateral_in, pool.trade_fee_bps).ok_or(BuyError::Math)?;
    if fee > collateral_in {
        return Err(BuyError::FeeExceedsAmount);
    }
    let net_c = collateral_in - fee;
    if net_c == 0 {
        return Err(BuyError::NetTooSmall);
    }

    let l = pool.virtual_liquidity_l as u128;
    let dy = match side {
        Side::Yes => cpmm::buy_yes_out(pool.yes_shares, pool.no_shares, net_c as u128, l),
        Side::No => cpmm::buy_no_out(pool.yes_shares, pool.no_shares, net_c as u128, l),
    }
    .map_err(|_| BuyError::Math)?;
    if dy == 0 {
        return Err(BuyError::SharesOutTooSmall);
    }
    let delta_shares = u64::try_from(dy).map_err(|_| BuyError::Math)?;

    let mut new_pool = pool.clone();
    new_pool.credit_shares(side, dy).ok_or(BuyError::Math)?;
    new_pool.credit_collateral(net_c).ok_or(BuyError::Math)?;
    new_pool
        .credit_cost_acc(side, net_c as u128)
        .ok_or(BuyError::Math)?;

    let creator_cut = mul_bps_floor(fee, pool.creator_share_bps).ok_or(BuyError::Math)?;
    let platform_cut = fee.checked_sub(creator_cut).ok_or(BuyError::Math)?;

    let mut new_position = *position;
    new_position
        .credit(side, dy, net_c as u128)
        .ok_or(BuyError::Math)?;

    Ok(BuyPlan {
        delta_shares,
        net_c,
        fee,
        platform_cut,
        creator_cut,
        new_pool,
        new_position,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::business::TradeGate;

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

    #[test]
    fn buy_updates_pool_and_position_cost_acc() {
        let pool = fresh_pool();
        let position = PositionSnapshot::default();

        let plan = plan_buy(&pool, &position, Side::Yes, 500_000_000, 0, false).unwrap();
        assert_eq!(plan.fee, 0);
        assert_eq!(plan.delta_shares, 750_000_000);
        assert_eq!(plan.new_pool.yes_shares, 750_000_000);
        assert_eq!(plan.new_pool.pool_collateral, 500_000_000);
        assert_eq!(plan.new_pool.total_yes_cost_acc, 500_000_000);
        assert_eq!(plan.new_position.yes_shares, 750_000_000);
        assert_eq!(plan.new_position.yes_cost_acc, 500_000_000);
    }

    #[test]
    fn buy_splits_fee_creator_platform() {
        let mut pool = fresh_pool();
        pool.trade_fee_bps = 30; // 0.3%
        pool.creator_share_bps = 5_000; // 50%
        let position = PositionSnapshot::default();

        let plan = plan_buy(&pool, &position, Side::Yes, 1_000_000, 0, false).unwrap();
        assert_eq!(plan.fee, 3_000); // ceil(1_000_000 * 30 / 10_000)
        assert_eq!(plan.creator_cut, 1_500);
        assert_eq!(plan.platform_cut, 1_500);
    }

    #[test]
    fn buy_zero_amount_rejected() {
        let pool = fresh_pool();
        let position = PositionSnapshot::default();
        assert_eq!(
            plan_buy(&pool, &position, Side::Yes, 0, 0, false),
            Err(BuyError::ZeroAmount)
        );
    }

    #[test]
    fn buy_paused_rejected() {
        let pool = fresh_pool();
        let position = PositionSnapshot::default();
        assert_eq!(
            plan_buy(&pool, &position, Side::Yes, 100, 0, true),
            Err(BuyError::from(TradeGate::Paused))
        );
    }

    #[test]
    fn buy_rejected_when_resolved() {
        let mut pool = fresh_pool();
        pool.resolution_code = 1;
        let position = PositionSnapshot::default();
        assert_eq!(
            plan_buy(&pool, &position, Side::Yes, 100, 0, false),
            Err(BuyError::AlreadyResolved)
        );
    }

    #[test]
    fn buy_rejected_when_cancelled() {
        let mut pool = fresh_pool();
        pool.cancelled = true;
        let position = PositionSnapshot::default();
        assert_eq!(
            plan_buy(&pool, &position, Side::Yes, 100, 0, false),
            Err(BuyError::AlreadyCancelled)
        );
    }

    #[test]
    fn buy_rejected_in_freeze_window() {
        let pool = fresh_pool();
        // freeze_at = 1_000_000 - 60
        assert_eq!(
            plan_buy(&pool, &PositionSnapshot::default(), Side::Yes, 100, 999_940, false),
            Err(BuyError::TradeFrozen)
        );
    }

    #[test]
    fn buy_net_too_small_when_fee_consumes_all() {
        let mut pool = fresh_pool();
        pool.trade_fee_bps = 10_000; // 100% fee
        let position = PositionSnapshot::default();
        assert_eq!(
            plan_buy(&pool, &position, Side::Yes, 100, 0, false),
            Err(BuyError::NetTooSmall)
        );
    }

    #[test]
    fn buy_preserves_existing_position_balance() {
        let pool = fresh_pool();
        let mut position = PositionSnapshot::default();
        position.no_shares = 42;
        position.no_cost_acc = 10;

        let plan = plan_buy(&pool, &position, Side::Yes, 500_000_000, 0, false).unwrap();
        assert_eq!(plan.new_position.no_shares, 42);
        assert_eq!(plan.new_position.no_cost_acc, 10);
    }
}
