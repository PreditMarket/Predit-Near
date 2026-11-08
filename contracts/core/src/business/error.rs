//! Pure error types for the `business::*` planning functions, one enum per module.

use crate::business::TradeGate;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BuyError {
    ZeroAmount,
    Paused,
    AlreadyResolved,
    AlreadyCancelled,
    TradeFrozen,
    FeeExceedsAmount,
    NetTooSmall,
    SharesOutTooSmall,
    Math,
}

impl From<TradeGate> for BuyError {
    fn from(e: TradeGate) -> Self {
        match e {
            TradeGate::Paused => BuyError::Paused,
            TradeGate::AlreadyResolved => BuyError::AlreadyResolved,
            TradeGate::AlreadyCancelled => BuyError::AlreadyCancelled,
            TradeGate::TradeFrozen => BuyError::TradeFrozen,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SellError {
    ZeroAmount,
    Paused,
    AlreadyResolved,
    AlreadyCancelled,
    TradeFrozen,
    InsufficientShares,
    PayoutTooSmall,
    InsufficientPoolCollateral,
    FeeExceedsAmount,
    /// MED-1: the counter side has zero cost basis — selling here would be
    /// the CRIT-2 attack primitive (drain the pool ahead of an AutoCancel
    /// refund haircut).
    OneSidedMarket,
    Math,
}

impl From<TradeGate> for SellError {
    fn from(e: TradeGate) -> Self {
        match e {
            TradeGate::Paused => SellError::Paused,
            TradeGate::AlreadyResolved => SellError::AlreadyResolved,
            TradeGate::AlreadyCancelled => SellError::AlreadyCancelled,
            TradeGate::TradeFrozen => SellError::TradeFrozen,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResolveError {
    AlreadyCancelled,
    PoolNotExpired,
    ResolutionFinalized,
    InvalidParams,
    Math,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RedeemError {
    // HIGH-1: redeem must always stay open — no `Paused` variant.
    NotResolved,
    ClaimDelayNotElapsed,
    InvalidMode,
    NothingToRedeem,
    PayoutTooSmall,
    InsufficientPoolCollateral,
    FeeExceedsAmount,
    Math,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RefundError {
    // HIGH-1: refund must always stay open — no `Paused` variant.
    NotCancelled,
    NothingToRefund,
    InsufficientPoolCollateral,
    Math,
}
