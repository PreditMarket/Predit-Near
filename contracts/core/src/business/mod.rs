//! Pure business logic: each `plan_*` takes snapshots and returns the new state.

pub mod buy;
pub mod error;
pub mod redeem;
pub mod refund;
pub mod resolve;
pub mod sell;

use crate::math::cpmm;
use crate::state::pool_v3::ResolveModeV3;
use crate::state::Side;

/// Shared paused / resolved / cancelled / freeze-window trade gate — reused
/// by both `plan_buy` and `plan_sell`, each mapping it into its own error
/// enum (see `error.rs`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TradeGate {
    Paused,
    AlreadyResolved,
    AlreadyCancelled,
    TradeFrozen,
}

/// Pure snapshot of the `PoolV3` fields business logic reads or mutates.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PoolSnapshot {
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
    /// `yes_shares` or `no_shares` (whichever side won) at resolve time.
    /// Telemetry/events only — the cost-weighted payout no longer uses it.
    pub resolved_win_shares: u128,
    pub resolved_ts: i64,
    /// HIGH-5: `redeem_fee_bps` snapshotted at resolve time — `redeem_v3`
    /// charges this instead of the live `redeem_fee_bps` so admin cannot
    /// pump the fee between a user's buy and their post-resolve redeem.
    pub resolved_redeem_fee_bps: u16,
}

impl PoolSnapshot {
    pub fn is_resolved(&self) -> bool {
        self.resolution_code != 0
    }

    pub fn resolution(&self) -> Option<Side> {
        match self.resolution_code {
            1 => Some(Side::Yes),
            2 => Some(Side::No),
            _ => None,
        }
    }

    pub fn set_resolution(&mut self, side: Side) {
        self.resolution_code = match side {
            Side::Yes => 1,
            Side::No => 2,
        };
    }

    pub fn mode(&self) -> Option<ResolveModeV3> {
        ResolveModeV3::try_from(self.mode).ok()
    }

    pub fn set_mode(&mut self, mode: ResolveModeV3) {
        self.mode = mode as u8;
    }

    pub fn freeze_at(&self) -> i64 {
        self.expiry_ts
            .saturating_sub(self.trade_freeze_seconds as i64)
    }

    /// Combined paused / resolved / cancelled / freeze-window gate shared by
    /// buy + sell.
    pub fn check_trade_allowed(&self, now: i64, paused: bool) -> Result<(), TradeGate> {
        if paused {
            return Err(TradeGate::Paused);
        }
        if self.is_resolved() {
            return Err(TradeGate::AlreadyResolved);
        }
        if self.cancelled {
            return Err(TradeGate::AlreadyCancelled);
        }
        if now >= self.freeze_at() {
            return Err(TradeGate::TradeFrozen);
        }
        Ok(())
    }

    pub fn credit_shares(&mut self, side: Side, amount: u128) -> Option<()> {
        let slot = match side {
            Side::Yes => &mut self.yes_shares,
            Side::No => &mut self.no_shares,
        };
        *slot = slot.checked_add(amount)?;
        Some(())
    }

    pub fn debit_shares(&mut self, side: Side, amount: u128) -> Option<()> {
        let slot = match side {
            Side::Yes => &mut self.yes_shares,
            Side::No => &mut self.no_shares,
        };
        *slot = slot.checked_sub(amount)?;
        Some(())
    }

    pub fn credit_collateral(&mut self, amount: u64) -> Option<()> {
        self.pool_collateral = self.pool_collateral.checked_add(amount)?;
        Some(())
    }

    pub fn debit_collateral(&mut self, amount: u64) -> Option<()> {
        self.pool_collateral = self.pool_collateral.checked_sub(amount)?;
        Some(())
    }

    pub fn credit_cost_acc(&mut self, side: Side, amount: u128) -> Option<()> {
        let slot = match side {
            Side::Yes => &mut self.total_yes_cost_acc,
            Side::No => &mut self.total_no_cost_acc,
        };
        *slot = slot.checked_add(amount)?;
        Some(())
    }

    pub fn debit_cost_acc(&mut self, side: Side, amount: u128) -> Option<()> {
        let slot = match side {
            Side::Yes => &mut self.total_yes_cost_acc,
            Side::No => &mut self.total_no_cost_acc,
        };
        *slot = slot.checked_sub(amount)?;
        Some(())
    }
}

/// Pure snapshot of `PositionV3`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct PositionSnapshot {
    pub yes_shares: u128,
    pub no_shares: u128,
    pub yes_cost_acc: u128,
    pub no_cost_acc: u128,
}

impl PositionSnapshot {
    pub fn is_empty(&self) -> bool {
        self.yes_shares == 0 && self.no_shares == 0 && self.yes_cost_acc == 0 && self.no_cost_acc == 0
    }

    /// Record a buy: credit `dy` shares + `net_c` cost basis on `side`.
    pub fn credit(&mut self, side: Side, dy: u128, net_c: u128) -> Option<()> {
        let (shares, cost) = match side {
            Side::Yes => (&mut self.yes_shares, &mut self.yes_cost_acc),
            Side::No => (&mut self.no_shares, &mut self.no_cost_acc),
        };
        *shares = shares.checked_add(dy)?;
        *cost = cost.checked_add(net_c)?;
        Some(())
    }

    /// Debit `shares_in` shares on `side`, scaling cost basis down
    /// proportionally. Returns the cost-basis removed, or `None` if
    /// `shares_in` exceeds the held balance or arithmetic overflows.
    pub fn debit_proportional(&mut self, side: Side, shares_in: u128) -> Option<u128> {
        let (shares, cost) = match side {
            Side::Yes => (&mut self.yes_shares, &mut self.yes_cost_acc),
            Side::No => (&mut self.no_shares, &mut self.no_cost_acc),
        };
        if *shares < shares_in {
            return None;
        }
        let cost_removed = mul_div(*cost, shares_in, *shares)?;
        *shares = shares.checked_sub(shares_in)?;
        *cost = cost.checked_sub(cost_removed)?;
        Some(cost_removed)
    }
}

// ---- shared fee/ratio math (Option-based, no Anchor error type) -----------

/// `ceil(a * bps / 10_000)`, `None` on overflow.
pub(crate) fn fee_ceil(amount: u64, bps: u16) -> Option<u64> {
    let ceil = cpmm::ceil_mul_div(amount as u128, bps as u128, 10_000).ok()?;
    u64::try_from(ceil).ok()
}

/// `floor(a * bps / 10_000)`, `None` on overflow.
pub(crate) fn mul_bps_floor(amount: u64, bps: u16) -> Option<u64> {
    let floor = mul_div(amount as u128, bps as u128, 10_000)?;
    u64::try_from(floor).ok()
}

/// `floor(a * b / c)` in u128, `None` on overflow/div-by-zero.
pub(crate) fn mul_div(a: u128, b: u128, c: u128) -> Option<u128> {
    cpmm::mul_div_u128(a, b, c).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pool() -> PoolSnapshot {
        PoolSnapshot {
            yes_shares: 100,
            no_shares: 50,
            pool_collateral: 1_000,
            total_yes_cost_acc: 700,
            total_no_cost_acc: 300,
            virtual_liquidity_l: 500_000_000,
            expiry_ts: 1_000,
            trade_freeze_seconds: 60,
            trade_fee_bps: 30,
            redeem_fee_bps: 30,
            creator_share_bps: 5_000,
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
    fn check_trade_allowed_gates_paused() {
        let snap = pool();
        assert_eq!(snap.check_trade_allowed(0, true), Err(TradeGate::Paused));
    }

    #[test]
    fn check_trade_allowed_gates_resolved() {
        let mut p = pool();
        p.resolution_code = 1;
        let snap = p;
        assert_eq!(
            snap.check_trade_allowed(0, false),
            Err(TradeGate::AlreadyResolved)
        );
    }

    #[test]
    fn check_trade_allowed_gates_cancelled() {
        let mut p = pool();
        p.cancelled = true;
        let snap = p;
        assert_eq!(
            snap.check_trade_allowed(0, false),
            Err(TradeGate::AlreadyCancelled)
        );
    }

    #[test]
    fn check_trade_allowed_gates_freeze_window() {
        let snap = pool();
        // freeze_at = 1000 - 60 = 940
        assert!(snap.check_trade_allowed(939, false).is_ok());
        assert_eq!(
            snap.check_trade_allowed(940, false),
            Err(TradeGate::TradeFrozen)
        );
    }

    #[test]
    fn credit_debit_shares_checked() {
        let mut snap = pool();
        assert_eq!(snap.credit_shares(Side::Yes, 10), Some(()));
        assert_eq!(snap.yes_shares, 110);
        assert_eq!(snap.debit_shares(Side::No, 51), None);
        assert_eq!(snap.debit_shares(Side::No, 50), Some(()));
        assert_eq!(snap.no_shares, 0);
    }

    #[test]
    fn credit_debit_collateral_checked() {
        let mut snap = pool();
        assert_eq!(snap.credit_collateral(u64::MAX), None);
        assert_eq!(snap.debit_collateral(1_001), None);
        assert_eq!(snap.debit_collateral(1_000), Some(()));
        assert_eq!(snap.pool_collateral, 0);
    }

    #[test]
    fn credit_debit_cost_acc_checked() {
        let mut snap = pool();
        assert_eq!(snap.credit_cost_acc(Side::Yes, 100), Some(()));
        assert_eq!(snap.total_yes_cost_acc, 800);
        assert_eq!(snap.debit_cost_acc(Side::No, 301), None);
        assert_eq!(snap.debit_cost_acc(Side::No, 300), Some(()));
    }

    #[test]
    fn position_credit_and_debit_proportional() {
        let mut pos = PositionSnapshot::default();
        assert_eq!(pos.credit(Side::Yes, 100, 60), Some(()));
        let removed = pos.debit_proportional(Side::Yes, 40).unwrap();
        assert_eq!(removed, 24);
        assert_eq!(pos.yes_shares, 60);
        assert_eq!(pos.yes_cost_acc, 36);
        assert!(!pos.is_empty());
        pos.debit_proportional(Side::Yes, 60).unwrap();
        assert!(pos.is_empty());
    }

    #[test]
    fn position_debit_more_than_held_is_none() {
        let mut pos = PositionSnapshot::default();
        pos.credit(Side::No, 10, 10).unwrap();
        assert_eq!(pos.debit_proportional(Side::No, 11), None);
    }

    #[test]
    fn mode_roundtrip_and_invalid_byte() {
        let mut snap = pool();
        assert_eq!(snap.mode(), Some(ResolveModeV3::Unresolved));
        snap.set_mode(ResolveModeV3::UniformProfit);
        assert_eq!(snap.mode(), Some(ResolveModeV3::UniformProfit));
        snap.mode = 99;
        assert_eq!(snap.mode(), None);
    }

    #[test]
    fn resolution_roundtrip() {
        let mut snap = pool();
        assert_eq!(snap.resolution(), None);
        snap.set_resolution(Side::No);
        assert_eq!(snap.resolution(), Some(Side::No));
        assert!(snap.is_resolved());
    }

    #[test]
    fn fee_ceil_rounds_up() {
        assert_eq!(fee_ceil(100, 30).unwrap(), 1);
        assert_eq!(fee_ceil(10_000, 30).unwrap(), 30);
        assert_eq!(fee_ceil(1_000, 0).unwrap(), 0);
    }

    #[test]
    fn mul_bps_floor_floors() {
        assert_eq!(mul_bps_floor(100, 3_000).unwrap(), 30);
        assert_eq!(mul_bps_floor(99, 3_000).unwrap(), 29);
    }

    #[test]
    fn mul_div_basic() {
        assert_eq!(mul_div(500, 1_600, 1_000), Some(800));
        assert_eq!(mul_div(1, 1, 0), None);
    }
}
