//! Virtual-CPMM bonding-curve math for pm-AMM v3.
//!
//! Invariant: `R_y * R_n = L^2` where `R_y = M - y`, `R_n = M - n`, and
//! `M = ((y + n) + sqrt((y - n)^2 + 4*L^2)) / 2`. `L` is a virtual liquidity
//! constant (never actually funded) that determines curve steepness. At
//! `y = n = 0`, `R_y = R_n = L` so `p_yes = p_no = 0.5`.
//!
//! All amounts are `u128` atoms. Every arithmetic op is checked; failures
//! surface as [`PmAmmError`]. Rounding convention: outputs to the trader
//! floor (pool wins ties) — fees are rounded up separately by the caller.

use crate::errors::{require, PmAmmError, Result};

/// Guard bound on `|y - n|` before squaring — keeps `diff^2 + 4*L^2` well
/// inside `u128::MAX` (2^126 vs 2^128) with margin for `L` up to ~2^63.
const MAX_DIFF: u128 = 1u128 << 63;

/// Integer square root via Newton's method (floor). `x = 0` returns `0`.
pub fn u128_sqrt(x: u128) -> u128 {
    if x == 0 {
        return 0;
    }
    if x < 2 {
        return x;
    }
    // Initial guess: bit-length based estimate to converge fast.
    let bits = 128 - x.leading_zeros();
    let mut guess: u128 = 1u128 << bits.div_ceil(2);
    if guess == 0 {
        guess = x;
    }
    loop {
        let next = (guess + x / guess) / 2;
        if next >= guess {
            break;
        }
        guess = next;
    }
    // Correct off-by-one from integer Newton's iteration. Use checked_mul
    // so a guess near u128::MAX never panics on overflow — an overflowing
    // square is definitionally `> x` (x is a valid u128), so treat it as such.
    while guess.checked_mul(guess).map_or(true, |sq| sq > x) {
        guess -= 1;
    }
    while (guess + 1)
        .checked_mul(guess + 1)
        .is_some_and(|sq| sq <= x)
    {
        guess += 1;
    }
    guess
}

/// `M = ((y + n) + sqrt((y - n)^2 + 4*L^2)) / 2`.
pub fn compute_m(y: u128, n: u128, l: u128) -> Result<u128> {
    let diff = if y >= n { y - n } else { n - y };
    require!(diff <= MAX_DIFF, PmAmmError::SqrtOverflow);

    let diff_sq = diff.checked_mul(diff).ok_or(PmAmmError::SqrtOverflow)?;
    let l_sq = l.checked_mul(l).ok_or(PmAmmError::SqrtOverflow)?;
    let four_l_sq = l_sq.checked_mul(4).ok_or(PmAmmError::SqrtOverflow)?;
    let disc = diff_sq
        .checked_add(four_l_sq)
        .ok_or(PmAmmError::SqrtOverflow)?;

    let sqrt_disc = u128_sqrt(disc);
    let sum = y.checked_add(n).ok_or(PmAmmError::MathOverflow)?;
    let numerator = sum
        .checked_add(sqrt_disc)
        .ok_or(PmAmmError::MathOverflow)?;
    Ok(numerator / 2)
}

/// Returns `(R_y, R_n)` reserves implied by `(y, n, L)`.
pub fn compute_reserves(y: u128, n: u128, l: u128) -> Result<(u128, u128)> {
    let m = compute_m(y, n, l)?;
    let r_y = m.checked_sub(y).ok_or(PmAmmError::MathOverflow)?;
    let r_n = m.checked_sub(n).ok_or(PmAmmError::MathOverflow)?;
    Ok((r_y, r_n))
}

/// `floor(a * b / c)`. Returns `MathOverflow` on multiply overflow or `c == 0`.
pub fn mul_div_u128(a: u128, b: u128, c: u128) -> Result<u128> {
    require!(c > 0, PmAmmError::MathFailure);
    let prod = a.checked_mul(b).ok_or(PmAmmError::MathOverflow)?;
    Ok(prod / c)
}

/// `ceil(a * b / c)`. Returns `MathOverflow` on multiply overflow or `c == 0`.
pub fn ceil_mul_div(a: u128, b: u128, c: u128) -> Result<u128> {
    require!(c > 0, PmAmmError::MathFailure);
    let prod = a.checked_mul(b).ok_or(PmAmmError::MathOverflow)?;
    let num = prod
        .checked_add(c - 1)
        .ok_or(PmAmmError::MathOverflow)?;
    Ok(num / c)
}

/// Buy YES: given `net_c` collateral in, returns `delta_y` shares out.
/// `Δy = (R_y + net_c) − L² / (R_n + net_c)`.
pub fn buy_yes_out(y: u128, n: u128, net_c: u128, l: u128) -> Result<u128> {
    let (r_y, r_n) = compute_reserves(y, n, l)?;
    let r_y_new = r_y.checked_add(net_c).ok_or(PmAmmError::MathOverflow)?;
    let r_n_new = r_n.checked_add(net_c).ok_or(PmAmmError::MathOverflow)?;
    let l_sq = l.checked_mul(l).ok_or(PmAmmError::MathOverflow)?;
    let term = l_sq / r_n_new;
    r_y_new.checked_sub(term).ok_or(PmAmmError::MathOverflow.into())
}

/// Buy NO: symmetric to [`buy_yes_out`] with `y`/`n` swapped.
pub fn buy_no_out(y: u128, n: u128, net_c: u128, l: u128) -> Result<u128> {
    buy_yes_out(n, y, net_c, l)
}

/// Sell YES: given `dy_in` shares in (`y` decreases by `dy_in`), returns
/// gross collateral out.
///
/// This is the exact algebraic inverse of [`buy_yes_out`] — a buy of
/// `net_c` moves `y -> y + Δy` such that `R_n` (recomputed on the new share
/// count) increases by exactly `net_c`. Selling walks that same curve
/// backwards: `y -> y - dy_in`, and `gross` is defined as the resulting
/// *decrease* in `R_n`. Implemented by recomputing reserves at the
/// pre- and post-sell share counts directly (no closed form needed — `R_n`
/// is not a linear function of `y`, so `R_n(y) - R_n(y - dy_in) != dy_in`
/// scaled by anything simple).
pub fn sell_yes_gross(y: u128, n: u128, dy_in: u128, l: u128) -> Result<u128> {
    require!(dy_in <= y, PmAmmError::InsufficientShares);
    let (_, r_n_before) = compute_reserves(y, n, l)?;
    let y_new = y - dy_in;
    let (_, r_n_after) = compute_reserves(y_new, n, l)?;
    r_n_before
        .checked_sub(r_n_after)
        .ok_or(PmAmmError::MathOverflow.into())
}

/// Sell NO: symmetric to [`sell_yes_gross`] — `n` decreases by `dn_in`,
/// gross is the resulting decrease in `R_y`.
pub fn sell_no_gross(y: u128, n: u128, dn_in: u128, l: u128) -> Result<u128> {
    require!(dn_in <= n, PmAmmError::InsufficientShares);
    let (r_y_before, _) = compute_reserves(y, n, l)?;
    let n_new = n - dn_in;
    let (r_y_after, _) = compute_reserves(y, n_new, l)?;
    r_y_before
        .checked_sub(r_y_after)
        .ok_or(PmAmmError::MathOverflow.into())
}

#[cfg(test)]
mod tests {
    use super::*;

    const L: u128 = 500_000_000; // 500 USDC atoms (6 decimals)

    #[test]
    fn compute_m_at_origin() {
        assert_eq!(compute_m(0, 0, L).unwrap(), L);
        assert_eq!(compute_m(0, 0, 1).unwrap(), 1);
    }

    #[test]
    fn compute_reserves_at_origin() {
        let (r_y, r_n) = compute_reserves(0, 0, L).unwrap();
        assert_eq!(r_y, L);
        assert_eq!(r_n, L);
    }

    #[test]
    fn u128_sqrt_exact_and_floor() {
        assert_eq!(u128_sqrt(0), 0);
        assert_eq!(u128_sqrt(1), 1);
        assert_eq!(u128_sqrt(4), 2);
        assert_eq!(u128_sqrt(15), 3);
        assert_eq!(u128_sqrt(16), 4);
        assert_eq!(u128_sqrt(1_000_000), 1_000);
        assert_eq!(u128_sqrt(u128::MAX), 18_446_744_073_709_551_615);
    }

    #[test]
    fn reserves_invariant_random_samples() {
        // Deterministic pseudo-random samples (no external RNG dependency).
        let mut seed: u128 = 12_345;
        for _ in 0..100 {
            seed = seed.wrapping_mul(6_364_136_223_846_793_005).wrapping_add(1);
            let y = seed % 1_000_000_000_000;
            seed = seed.wrapping_mul(6_364_136_223_846_793_005).wrapping_add(1);
            let n = seed % 1_000_000_000_000;

            let (r_y, r_n) = compute_reserves(y, n, L).unwrap();
            let product = r_y.checked_mul(r_n).unwrap();
            let l_sq = L * L;
            // Integer sqrt rounding — allow small relative tolerance.
            let diff = if product > l_sq {
                product - l_sq
            } else {
                l_sq - product
            };
            // Tolerance scales with the larger reserve (rounding of sqrt_disc).
            let tol = (r_y.max(r_n)) * 2 + 1;
            assert!(diff <= tol, "invariant broken: y={y} n={n} r_y={r_y} r_n={r_n} diff={diff} tol={tol}");
        }
    }

    #[test]
    fn buy_round_trip_from_origin() {
        let net_c = 500_000_000u128; // 500 USDC
        let dy = buy_yes_out(0, 0, net_c, L).unwrap();
        assert_eq!(dy, 750_000_000); // matches worked example in plan.md

        let gross_back = sell_yes_gross(dy, 0, dy, L).unwrap();
        // Round-trip should return ~net_c within small dust.
        let diff = if gross_back > net_c {
            gross_back - net_c
        } else {
            net_c - gross_back
        };
        assert!(diff <= 2, "round trip dust too large: {diff}");
    }

    #[test]
    fn buy_near_saturation_price_approaches_one() {
        let y = 100_000_000_000u128;
        let n = 50_000_000_000u128;
        let dy = buy_yes_out(y, n, 10_000_000, L).unwrap();
        // Deep in-the-money (p_yes ~ 0.9999): shares out should be close to
        // collateral in, within a small rounding band either side.
        assert!(dy <= 10_100_000, "dy={dy} too far above collateral_in");
        assert!(dy >= 9_900_000, "dy={dy} too far below collateral_in");
    }

    #[test]
    fn price_bounds_via_reserves() {
        let y = 750_000_000u128;
        let n = 0u128;
        let (r_y, r_n) = compute_reserves(y, n, L).unwrap();
        let p_yes_num = r_n;
        let p_total = r_y + r_n;
        assert!(p_yes_num < p_total);
        assert!(p_yes_num > 0);
    }

    #[test]
    fn sqrt_overflow_guard_rejects_large_diff() {
        let y = MAX_DIFF + 1;
        let n = 0u128;
        assert!(compute_m(y, n, L).is_err());
    }

    #[test]
    fn buy_dust_trade_still_yields_leverage_at_the_money() {
        // At p=0.5 (origin), the curve is steepest: even 1 atom in yields a
        // small positive share count (leverage ~2x at-the-money). Not zero —
        // the `dy > 0` guard exists for the (impossible-at-origin) case
        // where floor rounding could still zero it out deep off-the-money.
        let dy = buy_yes_out(0, 0, 1, L).unwrap();
        assert_eq!(dy, 2);
    }

    #[test]
    fn mul_div_u128_floors() {
        assert_eq!(mul_div_u128(10, 3, 4).unwrap(), 7); // 30/4 = 7.5 -> 7
        assert_eq!(mul_div_u128(0, 3, 4).unwrap(), 0);
        assert!(mul_div_u128(1, 1, 0).is_err());
    }

    #[test]
    fn ceil_mul_div_rounds_up() {
        assert_eq!(ceil_mul_div(100, 100, 10_000).unwrap(), 1); // 1% of 100 -> 1
        assert_eq!(ceil_mul_div(1, 100, 10_000).unwrap(), 1); // rounds up from 0.01
        assert_eq!(ceil_mul_div(10_000, 30, 10_000).unwrap(), 30);
    }

    #[test]
    fn sell_no_and_buy_no_symmetric() {
        let net_c = 500_000_000u128;
        let dy_yes = buy_yes_out(0, 0, net_c, L).unwrap();
        let dy_no = buy_no_out(0, 0, net_c, L).unwrap();
        assert_eq!(dy_yes, dy_no);

        let gross_yes = sell_yes_gross(dy_yes, 0, dy_yes, L).unwrap();
        let gross_no = sell_no_gross(0, dy_no, dy_no, L).unwrap();
        assert_eq!(gross_yes, gross_no);
    }
}
