//! Errors of the math layer.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PmAmmError {
    MathOverflow,
    MathFailure,
    SqrtOverflow,
    InsufficientShares,
    InvalidMode,
}

pub type Result<T> = core::result::Result<T, PmAmmError>;

macro_rules! require {
    ($cond:expr, $err:expr) => {
        if !($cond) {
            return Err($err);
        }
    };
}
pub(crate) use require;
