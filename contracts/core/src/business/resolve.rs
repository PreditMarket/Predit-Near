//! Pure planning logic for `resolve_v3`.
//!
//! Two first-resolve branches:
//! - **AutoCanceled** — one side never traded. No counterparty to pay
//!   against; everyone refunds their cost basis via `refund_v3`.
//! - **UniformProfit** — both sides carry cost basis. Snapshots
//!   `resolved_pool_collateral` and `resolved_x_win` so `redeem_v3` payout is
//!   stable even across a re-resolve.
//!
//! Re-resolve (mirror of V2 PR #17): within the claim window, the resolver
//! may flip winner — re-snapshots `resolved_x_win` for the new winner and
//! extends `resolved_ts`. Same-winner call is a no-op (must not extend the
//! window, else attackers could delay claims by spamming re-resolves).

use crate::business::error::ResolveError;
use crate::business::PoolSnapshot;
use crate::state::pool_v3::ResolveModeV3;
use crate::state::Side;

/// Which event the handler should emit for this plan.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResolveEvent {
    /// Same winner re-declared within the claim window — no state change.
    NoOp,
    /// First resolve or re-resolve into `UniformProfit`.
    Resolved,
    /// First resolve into `AutoCanceled` (one side never traded).
    AutoCanceled,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvePlan {
    pub event: ResolveEvent,
    pub winning_side: Side,
    pub mode: ResolveModeV3,
    pub resolved_pool_collateral: u64,
    pub resolved_x_win: u128,
    /// `yes_shares` or `no_shares` (whichever side won). Telemetry/events
    /// only — the cost-weighted payout no longer uses it.
    pub resolved_win_shares: u128,
    pub resolved_ts: i64,
    /// HIGH-5: `redeem_fee_bps` snapshotted at resolve time — see
    /// `PoolSnapshot::resolved_redeem_fee_bps`.
    pub resolved_redeem_fee_bps: u16,
    pub re_resolved: bool,
    pub new_pool: PoolSnapshot,
}

pub fn plan_resolve(
    pool: &PoolSnapshot,
    winning_side: Side,
    now: i64,
    claim_delay: i64,
) -> Result<ResolvePlan, ResolveError> {
    if pool.cancelled {
        return Err(ResolveError::AlreadyCancelled);
    }

    let mut new_pool = pool.clone();

    // ---- Re-resolve branch (already resolved as UniformProfit) -----------
    if pool.is_resolved() {
        if pool.resolution() == Some(winning_side) {
            // Same-winner: no-op. MUST NOT extend resolved_ts.
            return Ok(ResolvePlan {
                event: ResolveEvent::NoOp,
                winning_side,
                mode: pool.mode().unwrap_or(ResolveModeV3::Unresolved),
                resolved_pool_collateral: pool.resolved_pool_collateral,
                resolved_x_win: pool.resolved_x_win,
                resolved_win_shares: pool.resolved_win_shares,
                resolved_ts: pool.resolved_ts,
                resolved_redeem_fee_bps: pool.resolved_redeem_fee_bps,
                re_resolved: false,
                new_pool,
            });
        }

        let unlock = pool
            .resolved_ts
            .checked_add(claim_delay)
            .ok_or(ResolveError::Math)?;
        if now >= unlock {
            return Err(ResolveError::ResolutionFinalized);
        }

        // Re-snapshot from CURRENT cost basis. Safe because redeem is gated
        // on `now >= resolved_ts + claim_delay`, so nobody has drawn from
        // `pool_collateral` yet — snapshot is a pure re-read.
        let x_win = match winning_side {
            Side::Yes => pool.total_yes_cost_acc,
            Side::No => pool.total_no_cost_acc,
        };
        if x_win == 0 {
            return Err(ResolveError::InvalidParams);
        }
        // Defensive: the flipped winner's cost basis must fit inside the pot
        // snapshotted at first resolve, else `lose_cost` underflows at redeem.
        // Unreachable under the sell-cap invariant (C == Σ cost >= either
        // side), guarded so a re-resolve can never brick redemptions.
        if x_win > pool.resolved_pool_collateral as u128 {
            return Err(ResolveError::InvalidParams);
        }
        let win_shares = match winning_side {
            Side::Yes => pool.yes_shares,
            Side::No => pool.no_shares,
        };

        new_pool.set_resolution(winning_side);
        new_pool.resolved_x_win = x_win;
        new_pool.resolved_win_shares = win_shares;
        if now > new_pool.resolved_ts {
            new_pool.resolved_ts = now;
        }
        // HIGH-5: re-snapshot the redeem fee alongside x_win — same
        // "pure re-read, nobody has claimed yet" rationale as the rest of
        // the re-resolve snapshot.
        new_pool.resolved_redeem_fee_bps = pool.redeem_fee_bps;

        return Ok(ResolvePlan {
            event: ResolveEvent::Resolved,
            winning_side,
            mode: ResolveModeV3::UniformProfit,
            resolved_pool_collateral: new_pool.resolved_pool_collateral,
            resolved_x_win: new_pool.resolved_x_win,
            resolved_win_shares: new_pool.resolved_win_shares,
            resolved_ts: new_pool.resolved_ts,
            resolved_redeem_fee_bps: new_pool.resolved_redeem_fee_bps,
            re_resolved: true,
            new_pool,
        });
    }

    // ---- First-time resolve ---------------------------------------------
    // Early resolve (mirror of V2 PR #13): the trusted resolver MAY settle
    // before `expiry_ts` when the outcome is already known. `resolved_ts` is
    // set to `now` below, so the claim window anchors at the actual resolve
    // time. No expiry gate here — the permissionless oracle path
    // (`resolve_with_oracle_v3`) enforces `now >= expiry_ts` itself before it
    // ever reaches this planner, so only the resolver-signed `resolve_v3` can
    // settle early.

    // Winning-side cost basis — also the `X_win` used by BRANCH 2 below.
    let winner_cost = match winning_side {
        Side::Yes => pool.total_yes_cost_acc,
        Side::No => pool.total_no_cost_acc,
    };

    // BRANCH 1: AutoCancel + pro-rata refund when either
    //   (a) one side never traded (no counter-party to pay out), or
    //   (b) the winning side's cost basis exceeds pool collateral.
    // Case (b) is unreachable under the Semantic-B sell cap (which keeps
    // `pool_collateral >= Σ cost` invariant), but if that invariant is ever
    // weakened, `lose_cost = C - X_win` would underflow in `plan_redeem` and
    // strand EVERY winner. Falling back to a solvent pro-rata refund here is
    // strictly safer than trusting the invariant and bricking redemptions.
    if pool.total_yes_cost_acc == 0
        || pool.total_no_cost_acc == 0
        || (pool.pool_collateral as u128) < winner_cost
    {
        new_pool.set_mode(ResolveModeV3::AutoCanceled);
        new_pool.cancelled = true;
        new_pool.resolved_ts = std::cmp::max(new_pool.resolved_ts, now);
        // Snapshot cancel-time solvency state so `plan_refund` can pro-rate
        // against it. `resolved_x_win` is repurposed at AutoCanceled to hold
        // total cost basis (both sides). Under Option B (sell payout capped
        // at proportional cost basis), `pool_collateral >= Σ remaining_cost`
        // is invariant → pro-rate always == 1:1 raw cost refund; pro-rate
        // math retained as defensive safety net.
        new_pool.resolved_pool_collateral = new_pool.pool_collateral;
        new_pool.resolved_x_win = new_pool
            .total_yes_cost_acc
            .checked_add(new_pool.total_no_cost_acc)
            .ok_or(ResolveError::Math)?;
        // HIGH-5: snapshotted for consistency even though `plan_refund`
        // charges no fee — keeps the field meaningful if AutoCanceled ever
        // gains a fee path.
        new_pool.resolved_redeem_fee_bps = pool.redeem_fee_bps;
        return Ok(ResolvePlan {
            event: ResolveEvent::AutoCanceled,
            winning_side,
            mode: ResolveModeV3::AutoCanceled,
            resolved_pool_collateral: new_pool.resolved_pool_collateral,
            resolved_x_win: new_pool.resolved_x_win,
            resolved_win_shares: new_pool.resolved_win_shares,
            resolved_ts: new_pool.resolved_ts,
            resolved_redeem_fee_bps: new_pool.resolved_redeem_fee_bps,
            re_resolved: false,
            new_pool,
        });
    }

    // BRANCH 2: UniformProfit (cost-weighted payout) -- snapshot X_win, C,
    // and winning-side shares. `winner_cost > 0` and `pool_collateral >= winner_cost`
    // are both guaranteed here (BRANCH 1 handles the complements).
    let x_win = winner_cost;
    if x_win == 0 {
        return Err(ResolveError::InvalidParams); // defensive, unreachable
    }
    let win_shares = match winning_side {
        Side::Yes => pool.yes_shares,
        Side::No => pool.no_shares,
    };

    new_pool.set_resolution(winning_side);
    new_pool.set_mode(ResolveModeV3::UniformProfit);
    new_pool.resolved_pool_collateral = new_pool.pool_collateral;
    new_pool.resolved_x_win = x_win;
    new_pool.resolved_win_shares = win_shares;
    new_pool.resolved_ts = now;
    // HIGH-5 fix: snapshot the redeem fee at resolve time so `redeem_v3`
    // charges the fee in effect when the market settled, not whatever the
    // admin has since changed it to via `update_pool_v3_fees`.
    new_pool.resolved_redeem_fee_bps = pool.redeem_fee_bps;

    Ok(ResolvePlan {
        event: ResolveEvent::Resolved,
        winning_side,
        mode: ResolveModeV3::UniformProfit,
        resolved_pool_collateral: new_pool.resolved_pool_collateral,
        resolved_x_win: new_pool.resolved_x_win,
        resolved_win_shares: new_pool.resolved_win_shares,
        resolved_ts: new_pool.resolved_ts,
        resolved_redeem_fee_bps: new_pool.resolved_redeem_fee_bps,
        re_resolved: false,
        new_pool,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const CLAIM_DELAY: i64 = 24 * 60 * 60;

    fn pool() -> PoolSnapshot {
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
    fn one_sided_cost_auto_cancels() {
        let mut p = pool();
        p.total_yes_cost_acc = 1_000;
        p.total_no_cost_acc = 0;
        p.pool_collateral = 1_000;
        let plan = plan_resolve(&p, Side::Yes, 1_000, CLAIM_DELAY).unwrap();
        assert_eq!(plan.event, ResolveEvent::AutoCanceled);
        assert!(plan.new_pool.cancelled);
        assert_eq!(plan.new_pool.mode(), Some(ResolveModeV3::AutoCanceled));
        // Cost-basis refund snapshot: pool_collateral + total cost basis
        // (both sides) so `plan_refund` can pro-rate on drift-safe basis.
        assert_eq!(plan.new_pool.resolved_pool_collateral, 1_000);
        assert_eq!(plan.new_pool.resolved_x_win, 1_000); // total cost, both sides
    }

    #[test]
    fn winner_cost_exceeding_collateral_auto_cancels_instead_of_bricking() {
        // Pathological (invariant-violating) state: winning side's cost basis
        // exceeds pool collateral. Must AutoCancel + pro-rata refund, never
        // enter UniformProfit (which would underflow lose_cost at redeem and
        // strand every winner).
        let mut p = pool();
        p.total_yes_cost_acc = 1_000;
        p.total_no_cost_acc = 600;
        p.pool_collateral = 900; // < winner (YES) cost 1_000
        let plan = plan_resolve(&p, Side::Yes, 1_000, CLAIM_DELAY).unwrap();
        assert_eq!(plan.event, ResolveEvent::AutoCanceled);
        assert!(plan.new_pool.cancelled);
        assert_eq!(plan.new_pool.mode(), Some(ResolveModeV3::AutoCanceled));
        // But if collateral covers the winner, it stays UniformProfit.
        let mut ok = pool();
        ok.pool_collateral = 1_000; // == winner cost, boundary
        assert_eq!(
            plan_resolve(&ok, Side::Yes, 1_000, CLAIM_DELAY).unwrap().event,
            ResolveEvent::Resolved
        );
    }

    #[test]
    fn two_sided_cost_picks_uniform_profit() {
        let p = pool();
        let plan = plan_resolve(&p, Side::Yes, 1_000, CLAIM_DELAY).unwrap();
        assert_eq!(plan.event, ResolveEvent::Resolved);
        assert_eq!(plan.resolved_x_win, 1_000);
        assert_eq!(plan.resolved_pool_collateral, 1_600);
        assert_eq!(plan.resolved_win_shares, 1_000); // yes_shares snapshot
        assert!(!plan.re_resolved);
        assert_eq!(plan.new_pool.resolution(), Some(Side::Yes));
    }

    #[test]
    fn early_resolve_before_expiry_allowed() {
        // now (500) < expiry_ts (1_000): the resolver may still settle early.
        let p = pool();
        let plan = plan_resolve(&p, Side::Yes, 500, CLAIM_DELAY).unwrap();
        assert_eq!(plan.event, ResolveEvent::Resolved);
        assert_eq!(plan.new_pool.resolution(), Some(Side::Yes));
        // Claim window anchors at the actual (early) resolve time, not expiry.
        assert_eq!(plan.resolved_ts, 500);
    }

    #[test]
    fn already_cancelled_rejected() {
        let mut p = pool();
        p.cancelled = true;
        assert_eq!(
            plan_resolve(&p, Side::Yes, 1_000, CLAIM_DELAY),
            Err(ResolveError::AlreadyCancelled)
        );
    }

    #[test]
    fn same_winner_reresolve_is_noop() {
        let mut p = pool();
        p.resolution_code = 1;
        p.mode = ResolveModeV3::UniformProfit as u8;
        p.resolved_ts = 1_000;
        p.resolved_x_win = 1_000;
        p.resolved_pool_collateral = 1_600;
        let plan = plan_resolve(&p, Side::Yes, 1_500, CLAIM_DELAY).unwrap();
        assert_eq!(plan.event, ResolveEvent::NoOp);
        assert_eq!(plan.new_pool.resolved_ts, 1_000); // unchanged
    }

    #[test]
    fn flip_winner_reresolve_within_window() {
        let mut p = pool();
        p.resolution_code = 1;
        p.mode = ResolveModeV3::UniformProfit as u8;
        p.resolved_ts = 1_000;
        p.resolved_x_win = 1_000;
        p.resolved_pool_collateral = 1_600;

        let plan = plan_resolve(&p, Side::No, 1_500, CLAIM_DELAY).unwrap();
        assert_eq!(plan.event, ResolveEvent::Resolved);
        assert!(plan.re_resolved);
        assert_eq!(plan.new_pool.resolution(), Some(Side::No));
        assert_eq!(plan.new_pool.resolved_x_win, 600);
        assert_eq!(plan.new_pool.resolved_win_shares, 500); // no_shares snapshot
        assert_eq!(plan.new_pool.resolved_ts, 1_500);
    }

    #[test]
    fn reresolve_after_window_rejected() {
        let mut p = pool();
        p.resolution_code = 1;
        p.mode = ResolveModeV3::UniformProfit as u8;
        p.resolved_ts = 1_000;
        p.resolved_x_win = 1_000;
        p.resolved_pool_collateral = 1_600;

        assert_eq!(
            plan_resolve(&p, Side::No, 1_000 + CLAIM_DELAY, CLAIM_DELAY),
            Err(ResolveError::ResolutionFinalized)
        );
    }

    #[test]
    fn reresolve_to_zero_cost_side_rejected() {
        let mut p = pool();
        p.total_no_cost_acc = 0;
        p.resolution_code = 1;
        p.mode = ResolveModeV3::UniformProfit as u8;
        p.resolved_ts = 1_000;
        p.resolved_x_win = 1_000;
        p.resolved_pool_collateral = 1_600;

        assert_eq!(
            plan_resolve(&p, Side::No, 1_500, CLAIM_DELAY),
            Err(ResolveError::InvalidParams)
        );
    }

    #[test]
    fn reresolve_never_regresses_resolved_ts() {
        let mut p = pool();
        p.resolution_code = 1;
        p.mode = ResolveModeV3::UniformProfit as u8;
        p.resolved_ts = 1_000;
        p.resolved_x_win = 1_000;
        p.resolved_pool_collateral = 1_600;

        // now (999) < resolved_ts (1000) — resolved_ts should stay 1000.
        let plan = plan_resolve(&p, Side::No, 999, CLAIM_DELAY).unwrap();
        assert_eq!(plan.new_pool.resolved_ts, 1_000);
    }
}
