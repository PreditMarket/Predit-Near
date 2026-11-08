//! The two enums the planners share.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Side {
    Yes,
    No,
}

pub mod pool_v3 {
    use crate::errors::PmAmmError;

    #[repr(u8)]
    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    pub enum ResolveModeV3 {
        Unresolved = 0,
        /// Both sides staked: every winner earns the same return on stake.
        UniformProfit = 1,
        /// One side never traded (or the market was cancelled): refund at cost.
        AutoCanceled = 2,
    }

    impl TryFrom<u8> for ResolveModeV3 {
        type Error = PmAmmError;

        fn try_from(value: u8) -> Result<Self, Self::Error> {
            match value {
                0 => Ok(ResolveModeV3::Unresolved),
                1 => Ok(ResolveModeV3::UniformProfit),
                2 => Ok(ResolveModeV3::AutoCanceled),
                _ => Err(PmAmmError::InvalidMode),
            }
        }
    }
}
