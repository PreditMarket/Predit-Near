//! Chain-independent market logic.
//!
//! Economics: a cost-basis parimutuel. The virtual-CPMM curve only produces the
//! displayed price; payouts depend on collateral staked, never on shares.
//! Every function here is pure, so the NEAR contract only loads state, calls a
//! `plan_*`, applies the result and moves tokens.

pub mod business;
pub mod errors;
pub mod math;
pub mod state;
