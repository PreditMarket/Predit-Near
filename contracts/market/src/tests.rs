use super::*;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::testing_env;

const T0: u64 = 1_000_000;
const EXPIRY: u64 = T0 + 3_600;
const USDC: u64 = 1_000_000;

fn acc(name: &str) -> AccountId {
    name.parse().unwrap()
}

fn at(sec: u64, caller: &str, deposit: NearToken) {
    let mut ctx = VMContextBuilder::new();
    ctx.current_account_id(acc("market.near"))
        .predecessor_account_id(acc(caller))
        .signer_account_id(acc(caller))
        .block_timestamp(sec * 1_000_000_000)
        .attached_deposit(deposit)
        .prepaid_gas(Gas::from_tgas(300))
        .account_balance(NearToken::from_near(1_000));
    testing_env!(ctx.build());
}

fn call(sec: u64, caller: &str) {
    at(sec, caller, NearToken::from_yoctonear(0));
}

fn yocto(sec: u64, caller: &str) {
    at(sec, caller, ONE_YOCTO);
}

fn contract() -> Contract {
    call(T0, "owner.near");
    Contract::new(
        acc("owner.near"),
        acc("operator.near"),
        acc("arbiter.near"),
        acc("treasury.near"),
        acc("usdc.near"),
        Some(Config { min_challenge_window_sec: 60, ..Config::default() }),
    )
}

fn rules() -> Rules {
    Rules {
        question: "Will SOL close above 250 on the listed date?".into(),
        description: "From a post predicting SOL above 250.".into(),
        yes_label: "Yes".into(),
        no_label: "No".into(),
        yes_condition: "The listed source shows SOL at or above 250".into(),
        no_condition: "The listed source shows SOL below 250".into(),
        resolution_source: "https://www.coingecko.com/en/coins/solana".into(),
        invalid_conditions: "The source does not show a price".into(),
        category: "Crypto".into(),
        image_url: "https://example.com/sol.png".into(),
        expiry_sec: U64(EXPIRY),
    }
}

/// A market with named sides: a sports result, an election, an announcement.
fn event_rules() -> Rules {
    Rules {
        question: "Will the Lakers beat the Celtics?".into(),
        description: "From a post calling the game for the Lakers.".into(),
        yes_label: "Lakers".into(),
        no_label: "Celtics".into(),
        yes_condition: "Lakers win, including overtime".into(),
        no_condition: "Celtics win, including overtime".into(),
        resolution_source: "https://www.nba.com/scores".into(),
        invalid_conditions: "The game is cancelled".into(),
        category: "Sports".into(),
        image_url: String::new(),
        expiry_sec: U64(EXPIRY),
    }
}

fn create_event(c: &mut Contract, post_id: &str) -> U64 {
    at(T0, "creator.near", NearToken::from_near(2));
    c.create_market(post(post_id), Side::Yes, event_rules(), draft(), Some(120))
}

fn proposed(side: Side) -> Report {
    Report::Proposed { outcome: side, reason: "Confirmed from the listed source".into() }
}

fn post(id: &str) -> PostRef {
    PostRef {
        source: "x".into(),
        post_id: id.into(),
        author_ref: "x:alice".into(),
        text: "SOL will exceed $250".into(),
    }
}

fn draft() -> DraftRef {
    DraftRef { model: "glm".into(), chat_id: "chat-1".into() }
}

fn create_on(c: &mut Contract, post_id: &str) -> U64 {
    at(T0, "creator.near", NearToken::from_near(2));
    c.create_market(post(post_id), Side::Yes, rules(), draft(), Some(120))
}

fn create(c: &mut Contract) -> U64 {
    create_on(c, "p1")
}

fn buy(c: &mut Contract, who: &str, id: U64, side: Side, amount: u64) {
    call(T0 + 10, "usdc.near");
    let side = if side == Side::Yes { "yes" } else { "no" };
    let msg = format!(r#"{{"action":"buy","market_id":"{}","side":"{side}","min_shares":"0"}}"#, id.0);
    let _ = c.ft_on_transfer(acc(who), U128(amount as u128), msg);
}

fn evidence() -> Evidence {
    Evidence {
        hash: "a".repeat(64),
        uri: "https://example.com/snapshot".into(),
        ai: Some(AiReading {
            model: "glm".into(),
            chat_id: "chat-2".into(),
            // Real lengths: two sha256 hex digests, a 65-byte ECDSA signature.
            signed_text: format!("{}:{}", "c".repeat(64), "d".repeat(64)),
            signature: format!("0x{}", "ab".repeat(65)),
            signing_address: "0xb98a789cdc4817275f5155593ba73ef2a957e779".into(),
        }),
    }
}

fn receipt(c: &mut Contract, id: U64, side: Side) {
    call(EXPIRY + 1, "operator.near");
    c.post_receipt(id, proposed(side), evidence());
}

fn finalize(c: &mut Contract, id: U64) {
    call(EXPIRY + 1 + 120, "anyone.near");
    c.finalize(id);
}

fn two_sided(c: &mut Contract) -> U64 {
    let id = create(c);
    buy(c, "yes.near", id, Side::Yes, 100 * USDC);
    buy(c, "no.near", id, Side::No, 100 * USDC);
    id
}

fn status(c: &Contract, id: U64) -> Status {
    c.get_market(id).unwrap().status
}

/// Everything the contract owes must be covered by what it took in.
fn assert_solvent(c: &Contract, taken: u128, paid: u128) {
    let a = c.get_accounting();
    assert!(a.total_pool_collateral.0 + a.total_claimable.0 + a.in_flight.0 <= taken - paid);
}

// ---- create ----------------------------------------------------------------

#[test]
fn create_locks_rules_and_is_open() {
    let mut c = contract();
    let id = create(&mut c);
    let m = c.get_market(id).unwrap();
    assert_eq!(m.status, Status::Open);
    assert_eq!(m.rules, rules());
    assert_eq!(m.rules_hash.len(), 64);
    assert_eq!(m.price_yes_bps, 5_000);
}

#[test]
fn same_rules_give_the_same_hash() {
    let mut c = contract();
    let a = create_on(&mut c, "p1");
    let b = create_on(&mut c, "p2");
    assert_eq!(c.get_market(a).unwrap().rules_hash, c.get_market(b).unwrap().rules_hash);
}

#[test]
#[should_panic(expected = "Attach at least")]
fn create_needs_the_bond() {
    let mut c = contract();
    at(T0, "creator.near", NearToken::from_millinear(500));
    c.create_market(post("p1"), Side::Yes, rules(), draft(), None);
}

#[test]
#[should_panic(expected = "Expiry is too soon")]
fn create_rejects_past_expiry() {
    let mut c = contract();
    at(EXPIRY, "creator.near", NearToken::from_near(2));
    c.create_market(post("p1"), Side::Yes, rules(), draft(), None);
}

#[test]
#[should_panic(expected = "Challenge window out of range")]
fn create_rejects_a_short_window() {
    let mut c = contract();
    at(T0, "creator.near", NearToken::from_near(2));
    c.create_market(post("p1"), Side::Yes, rules(), draft(), Some(10));
}

#[test]
#[should_panic(expected = "Too many markets on this post")]
fn create_caps_markets_per_post() {
    let mut c = contract();
    for _ in 0..6 {
        create_on(&mut c, "p1");
    }
}

#[test]
#[should_panic(expected = "Text is too long")]
fn create_rejects_oversized_text() {
    let mut c = contract();
    let mut r = rules();
    r.question = "x".repeat(MAX_SHORT_TEXT + 1);
    at(T0, "creator.near", NearToken::from_near(2));
    c.create_market(post("p1"), Side::Yes, r, draft(), None);
}

#[test]
#[should_panic(expected = "Paused")]
fn create_is_blocked_when_paused() {
    let mut c = contract();
    call(T0, "owner.near");
    c.set_paused(true);
    create(&mut c);
}

#[test]
fn markets_are_found_by_post() {
    let mut c = contract();
    let id = create(&mut c);
    let found = c.get_markets_for_posts(vec!["p1".into(), "none".into()]);
    assert_eq!(found[0].1[0].id, id);
    assert!(found[1].1.is_empty());
}

// ---- buy -------------------------------------------------------------------

#[test]
#[should_panic(expected = "Wrong token")]
fn buy_rejects_a_fake_token() {
    let mut c = contract();
    let id = create(&mut c);
    call(T0 + 10, "fake.near");
    let msg = format!(r#"{{"action":"buy","market_id":"{}","side":"yes","min_shares":"0"}}"#, id.0);
    let _ = c.ft_on_transfer(acc("yes.near"), U128(100 * USDC as u128), msg);
}

#[test]
#[should_panic(expected = "Invalid message")]
fn buy_rejects_a_bad_message() {
    let mut c = contract();
    create(&mut c);
    call(T0 + 10, "usdc.near");
    let _ = c.ft_on_transfer(acc("yes.near"), U128(USDC as u128), "nope".into());
}

#[test]
#[should_panic(expected = "Below the minimum buy")]
fn buy_enforces_the_minimum() {
    let mut c = contract();
    let id = create(&mut c);
    buy(&mut c, "yes.near", id, Side::Yes, USDC - 1);
}

#[test]
#[should_panic(expected = "Slippage")]
fn buy_enforces_slippage() {
    let mut c = contract();
    let id = create(&mut c);
    call(T0 + 10, "usdc.near");
    let msg = format!(
        r#"{{"action":"buy","market_id":"{}","side":"yes","min_shares":"{}"}}"#,
        id.0,
        u64::MAX
    );
    let _ = c.ft_on_transfer(acc("yes.near"), U128(USDC as u128), msg);
}

#[test]
#[should_panic(expected = "TradeFrozen")]
fn buy_is_blocked_in_the_freeze_window() {
    let mut c = contract();
    let id = create(&mut c);
    call(EXPIRY - 5, "usdc.near");
    let msg = format!(r#"{{"action":"buy","market_id":"{}","side":"yes","min_shares":"0"}}"#, id.0);
    let _ = c.ft_on_transfer(acc("yes.near"), U128(USDC as u128), msg);
}

#[test]
fn buy_splits_the_fee_and_moves_the_price() {
    let mut c = contract();
    let id = create(&mut c);
    buy(&mut c, "yes.near", id, Side::Yes, 100 * USDC);

    // 0.3% fee, creator keeps 10% of it.
    let fee = 300_000u128;
    assert_eq!(c.get_claimable(acc("creator.near")).0, fee / 10);
    assert_eq!(c.get_claimable(acc("treasury.near")).0, fee - fee / 10);
    let m = c.get_market(id).unwrap();
    assert_eq!(m.pool_collateral.0, 100 * USDC as u128 - fee);
    assert!(m.price_yes_bps > 5_000);
    assert_eq!(c.get_position(id, acc("yes.near")).yes_cost.0, 100 * USDC as u128 - fee);
    assert_eq!(c.get_user_markets(acc("yes.near"), None, None).len(), 1);
    assert_solvent(&c, 100 * USDC as u128, 0);
}

#[test]
fn buying_twice_lists_the_market_once() {
    let mut c = contract();
    let id = create(&mut c);
    buy(&mut c, "yes.near", id, Side::Yes, 10 * USDC);
    buy(&mut c, "yes.near", id, Side::No, 10 * USDC);
    assert_eq!(c.get_user_markets(acc("yes.near"), None, None).len(), 1);
}

// ---- sell ------------------------------------------------------------------

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn sell_needs_one_yocto() {
    let mut c = contract();
    let id = two_sided(&mut c);
    call(T0 + 20, "yes.near");
    let _ = c.sell(id, Side::Yes, U128(1), U128(0));
}

#[test]
fn sell_returns_the_stake() {
    let mut c = contract();
    let id = two_sided(&mut c);
    let shares = c.get_position(id, acc("yes.near")).yes_shares;
    yocto(T0 + 20, "yes.near");
    let _ = c.sell(id, Side::Yes, shares, U128(0));

    let p = c.get_position(id, acc("yes.near"));
    assert_eq!(p.yes_shares.0, 0);
    assert_eq!(p.yes_cost.0, 0);
    let a = c.get_accounting();
    assert!(a.in_flight.0 > 0);
    assert_solvent(&c, 200 * USDC as u128, 0);
}

#[test]
#[should_panic(expected = "Slippage")]
fn sell_enforces_slippage() {
    let mut c = contract();
    let id = two_sided(&mut c);
    let shares = c.get_position(id, acc("yes.near")).yes_shares;
    yocto(T0 + 20, "yes.near");
    let _ = c.sell(id, Side::Yes, shares, U128(u64::MAX as u128));
}

// ---- receipt ---------------------------------------------------------------

#[test]
#[should_panic(expected = "Operator only")]
fn receipt_is_operator_only() {
    let mut c = contract();
    let id = create(&mut c);
    call(EXPIRY + 1, "anyone.near");
    c.post_receipt(id, proposed(Side::Yes), evidence());
}

#[test]
#[should_panic(expected = "Market has not expired")]
fn receipt_waits_for_expiry() {
    let mut c = contract();
    let id = create(&mut c);
    call(EXPIRY - 1, "operator.near");
    c.post_receipt(id, proposed(Side::Yes), evidence());
}

#[test]
fn due_and_finalizable_lists_follow_the_lifecycle() {
    let mut c = contract();
    let id = create(&mut c);
    call(T0 + 1, "anyone.near");
    assert!(c.get_due_markets(None, None).is_empty());
    call(EXPIRY, "anyone.near");
    assert_eq!(c.get_due_markets(None, None)[0].id, id);

    receipt(&mut c, id, Side::Yes);
    assert!(c.get_due_markets(None, None).is_empty());
    assert!(c.get_finalizable(None, None).is_empty());
    call(EXPIRY + 1 + 120, "anyone.near");
    assert_eq!(c.get_finalizable(None, None), vec![id]);
}

// ---- event markets ---------------------------------------------------------

#[test]
fn an_event_market_keeps_its_labels_and_content() {
    let mut c = contract();
    let id = create_event(&mut c, "p1");
    let m = c.get_market(id).unwrap();
    assert_eq!(m.rules.yes_label, "Lakers");
    assert_eq!(m.rules.category, "Sports");
}

#[test]
fn the_operator_proposes_an_event_outcome() {
    let mut c = contract();
    let id = create_event(&mut c, "p1");
    buy(&mut c, "yes.near", id, Side::Yes, 100 * USDC);
    buy(&mut c, "no.near", id, Side::No, 100 * USDC);
    receipt(&mut c, id, Side::No);
    let r = c.get_market(id).unwrap().receipt.unwrap();
    assert_eq!(r.outcome, Outcome::No);
    let ai = r.evidence.ai.unwrap();
    assert_eq!(ai.signature.len(), 132);
    assert_eq!(ai.signing_address.len(), 42);
    assert_eq!(ai.signed_text.len(), 129);

    finalize(&mut c, id);
    let record = c.get_record("x:alice".into());
    assert_eq!((record.correct, record.wrong), (0, 1));
    yocto(EXPIRY + 200, "no.near");
    let _ = c.redeem(id);
    assert!(c.get_accounting().in_flight.0 > 0);
}

#[test]
#[should_panic(expected = "Evidence is required")]
fn an_event_outcome_needs_evidence() {
    let mut c = contract();
    let id = create_event(&mut c, "p1");
    call(EXPIRY + 1, "operator.near");
    c.post_receipt(
        id,
        Report::Proposed { outcome: Side::Yes, reason: "trust me".into() },
        Evidence { hash: String::new(), uri: String::new(), ai: None },
    );
}

#[test]
#[should_panic(expected = "Operator only")]
fn only_the_operator_proposes_an_event_outcome() {
    let mut c = contract();
    let id = create_event(&mut c, "p1");
    call(EXPIRY + 1, "creator.near");
    c.post_receipt(id, Report::Proposed { outcome: Side::Yes, reason: "x".into() }, evidence());
}

#[test]
#[should_panic(expected = "Market has not expired")]
fn an_event_outcome_waits_for_expiry() {
    let mut c = contract();
    let id = create_event(&mut c, "p1");
    call(EXPIRY - 1, "operator.near");
    c.post_receipt(id, Report::Proposed { outcome: Side::Yes, reason: "x".into() }, evidence());
}

fn create_with(r: Rules) {
    let mut c = contract();
    at(T0, "creator.near", NearToken::from_near(2));
    c.create_market(post("p1"), Side::Yes, r, draft(), None);
}

#[test]
#[should_panic(expected = "Two different outcome labels")]
fn labels_must_differ() {
    let mut r = event_rules();
    r.no_label = r.yes_label.clone();
    create_with(r);
}

#[test]
#[should_panic(expected = "Label is too long")]
fn labels_are_capped() {
    let mut r = event_rules();
    r.yes_label = "x".repeat(MAX_LABEL + 1);
    create_with(r);
}

#[test]
#[should_panic(expected = "A resolution source is required")]
fn an_event_needs_a_resolution_source() {
    let mut r = event_rules();
    r.resolution_source = String::new();
    create_with(r);
}

#[test]
#[should_panic(expected = "Image must be an https URL")]
fn images_must_be_https() {
    let mut r = event_rules();
    r.image_url = "javascript:alert(1)".into();
    create_with(r);
}

// ---- finalize and payouts --------------------------------------------------

#[test]
#[should_panic(expected = "Challenge window is still open")]
fn finalize_waits_for_the_window() {
    let mut c = contract();
    let id = two_sided(&mut c);
    receipt(&mut c, id, Side::Yes);
    call(EXPIRY + 1 + 119, "anyone.near");
    c.finalize(id);
}

#[test]
#[should_panic(expected = "Market is not finalized")]
fn redeem_waits_for_finalize() {
    let mut c = contract();
    let id = two_sided(&mut c);
    receipt(&mut c, id, Side::Yes);
    yocto(EXPIRY + 2, "yes.near");
    let _ = c.redeem(id);
}

#[test]
fn the_winner_takes_the_losing_stake() {
    let mut c = contract();
    let id = two_sided(&mut c);
    receipt(&mut c, id, Side::Yes);
    finalize(&mut c, id);
    assert_eq!(status(&c, id), Status::Finalized);

    yocto(EXPIRY + 200, "yes.near");
    let _ = c.redeem(id);
    let a = c.get_accounting();
    // Pot 199.4 USDC, redeem fee 1% taken from it.
    let pot = 199_400_000u128;
    let fee = pot.div_ceil(100);
    assert_eq!(a.in_flight.0, pot - fee);
    assert_eq!(a.total_pool_collateral.0, 0);
    assert_solvent(&c, 200 * USDC as u128, 0);
}

#[test]
#[should_panic(expected = "NothingToRedeem")]
fn the_loser_has_nothing_to_redeem() {
    let mut c = contract();
    let id = two_sided(&mut c);
    receipt(&mut c, id, Side::Yes);
    finalize(&mut c, id);
    yocto(EXPIRY + 200, "no.near");
    let _ = c.redeem(id);
}

#[test]
#[should_panic(expected = "NothingToRedeem")]
fn a_winner_cannot_redeem_twice() {
    let mut c = contract();
    let id = two_sided(&mut c);
    receipt(&mut c, id, Side::Yes);
    finalize(&mut c, id);
    yocto(EXPIRY + 200, "yes.near");
    let _ = c.redeem(id);
    let _ = c.redeem(id);
}

#[test]
fn a_one_sided_market_refunds() {
    let mut c = contract();
    let id = create(&mut c);
    buy(&mut c, "yes.near", id, Side::Yes, 100 * USDC);
    receipt(&mut c, id, Side::Yes);
    finalize(&mut c, id);

    yocto(EXPIRY + 200, "yes.near");
    let _ = c.refund(id);
    assert_eq!(c.get_accounting().in_flight.0, 99_700_000);
    assert_eq!(c.get_accounting().total_pool_collateral.0, 0);
}

#[test]
fn an_invalid_market_refunds_both_sides() {
    let mut c = contract();
    let id = two_sided(&mut c);
    call(EXPIRY + 1, "operator.near");
    c.post_receipt(
        id,
        Report::Invalid { kind: InvalidKind::SourceUnavailable, reason: "no price".into() },
        evidence(),
    );
    finalize(&mut c, id);
    assert_eq!(c.get_market(id).unwrap().outcome, Some(Outcome::Invalid(InvalidKind::SourceUnavailable)));

    yocto(EXPIRY + 200, "yes.near");
    let _ = c.refund(id);
    yocto(EXPIRY + 200, "no.near");
    let _ = c.refund(id);
    assert_eq!(c.get_accounting().total_pool_collateral.0, 0);
    assert_solvent(&c, 200 * USDC as u128, 0);
}

// ---- challenge -------------------------------------------------------------

fn challenge(c: &mut Contract, id: U64) {
    at(EXPIRY + 2, "challenger.near", NearToken::from_near(1));
    c.challenge(id, "https://example.com/why".into());
}

#[test]
#[should_panic(expected = "Attach the challenge bond")]
fn challenge_needs_a_bond() {
    let mut c = contract();
    let id = two_sided(&mut c);
    receipt(&mut c, id, Side::Yes);
    at(EXPIRY + 2, "challenger.near", NearToken::from_millinear(1));
    c.challenge(id, "x".into());
}

#[test]
#[should_panic(expected = "Challenge window is over")]
fn challenge_closes_with_the_window() {
    let mut c = contract();
    let id = two_sided(&mut c);
    receipt(&mut c, id, Side::Yes);
    at(EXPIRY + 1 + 120, "challenger.near", NearToken::from_near(1));
    c.challenge(id, "x".into());
}

#[test]
#[should_panic(expected = "Nothing to finalize")]
fn a_challenge_blocks_finalize() {
    let mut c = contract();
    let id = two_sided(&mut c);
    receipt(&mut c, id, Side::Yes);
    challenge(&mut c, id);
    finalize(&mut c, id);
}

#[test]
#[should_panic(expected = "Arbiter only")]
fn arbitrate_is_arbiter_only() {
    let mut c = contract();
    let id = two_sided(&mut c);
    receipt(&mut c, id, Side::Yes);
    challenge(&mut c, id);
    call(EXPIRY + 3, "operator.near");
    c.arbitrate(id, Decision::Uphold);
}

#[test]
#[should_panic(expected = "Overturn must change the outcome")]
fn overturn_must_change_something() {
    let mut c = contract();
    let id = two_sided(&mut c);
    receipt(&mut c, id, Side::Yes);
    challenge(&mut c, id);
    call(EXPIRY + 3, "arbiter.near");
    c.arbitrate(id, Decision::Overturn(Outcome::Yes));
}

#[test]
fn overturn_flips_the_winner() {
    let mut c = contract();
    let id = two_sided(&mut c);
    receipt(&mut c, id, Side::Yes);
    challenge(&mut c, id);
    call(EXPIRY + 3, "arbiter.near");
    c.arbitrate(id, Decision::Overturn(Outcome::No));
    assert_eq!(c.get_market(id).unwrap().outcome, Some(Outcome::No));

    yocto(EXPIRY + 200, "no.near");
    let _ = c.redeem(id);
    assert!(c.get_accounting().in_flight.0 > 0);
}

#[test]
fn uphold_keeps_the_receipt() {
    let mut c = contract();
    let id = two_sided(&mut c);
    receipt(&mut c, id, Side::Yes);
    challenge(&mut c, id);
    call(EXPIRY + 3, "arbiter.near");
    c.arbitrate(id, Decision::Uphold);
    assert_eq!(c.get_market(id).unwrap().outcome, Some(Outcome::Yes));
}

// ---- forecasting record ----------------------------------------------------

#[test]
fn a_correct_call_counts_for_the_author() {
    let mut c = contract();
    let id = two_sided(&mut c);
    receipt(&mut c, id, Side::Yes);
    finalize(&mut c, id);
    let r = c.get_record("x:alice".into());
    assert_eq!((r.correct, r.wrong), (1, 0));
}

#[test]
fn a_wrong_call_counts_against_the_author() {
    let mut c = contract();
    let id = two_sided(&mut c);
    receipt(&mut c, id, Side::No);
    finalize(&mut c, id);
    let r = c.get_record("x:alice".into());
    assert_eq!((r.correct, r.wrong), (0, 1));
}

#[test]
fn a_market_nobody_bet_against_does_not_count() {
    let mut c = contract();
    let id = create(&mut c);
    buy(&mut c, "yes.near", id, Side::Yes, 100 * USDC);
    receipt(&mut c, id, Side::Yes);
    finalize(&mut c, id);
    assert_eq!(c.get_record("x:alice".into()), ForecastRecord::default());
}

#[test]
fn only_the_first_market_on_a_post_counts() {
    let mut c = contract();
    let a = create_on(&mut c, "p1");
    let b = create_on(&mut c, "p1");
    for id in [a, b] {
        buy(&mut c, "yes.near", id, Side::Yes, 10 * USDC);
        buy(&mut c, "no.near", id, Side::No, 10 * USDC);
        receipt(&mut c, id, Side::Yes);
        finalize(&mut c, id);
    }
    let r = c.get_record("x:alice".into());
    assert_eq!((r.correct, r.wrong), (1, 0));
}

#[test]
fn an_invalid_market_does_not_count() {
    let mut c = contract();
    let id = create_event(&mut c, "p1");
    buy(&mut c, "yes.near", id, Side::Yes, 100 * USDC);
    buy(&mut c, "no.near", id, Side::No, 100 * USDC);
    call(EXPIRY + 1, "operator.near");
    c.post_receipt(
        id,
        Report::Invalid { kind: InvalidKind::AmbiguousRules, reason: "unclear".into() },
        evidence(),
    );
    finalize(&mut c, id);
    assert_eq!(c.get_record("x:alice".into()), ForecastRecord::default());
}

// ---- cancel and stuck ------------------------------------------------------

#[test]
fn the_creator_can_cancel_before_any_trade() {
    let mut c = contract();
    let id = create(&mut c);
    call(T0 + 1, "creator.near");
    c.cancel_market(id);
    assert_eq!(status(&c, id), Status::Cancelled);
}

#[test]
#[should_panic(expected = "Not allowed")]
fn the_creator_cannot_cancel_after_a_trade() {
    let mut c = contract();
    let id = two_sided(&mut c);
    call(T0 + 20, "creator.near");
    c.cancel_market(id);
}

#[test]
fn the_owner_can_cancel_and_everyone_refunds() {
    let mut c = contract();
    let id = two_sided(&mut c);
    call(T0 + 20, "owner.near");
    c.cancel_market(id);
    yocto(T0 + 30, "yes.near");
    let _ = c.refund(id);
    assert_eq!(c.get_accounting().in_flight.0, 99_700_000);
}

#[test]
#[should_panic(expected = "Too early")]
fn claim_stuck_waits() {
    let mut c = contract();
    let id = two_sided(&mut c);
    call(EXPIRY + 100, "anyone.near");
    c.claim_stuck(id);
}

#[test]
fn claim_stuck_frees_a_silent_market() {
    let mut c = contract();
    let id = two_sided(&mut c);
    call(EXPIRY + 7 * 86_400, "anyone.near");
    c.claim_stuck(id);
    assert_eq!(status(&c, id), Status::Cancelled);
}

#[test]
fn a_silent_arbiter_leaves_the_receipt_standing() {
    let mut c = contract();
    let id = two_sided(&mut c);
    receipt(&mut c, id, Side::Yes);
    challenge(&mut c, id);
    call(EXPIRY + 2 + 7 * 86_400, "anyone.near");
    c.claim_stuck(id);
    let m = c.get_market(id).unwrap();
    assert_eq!(m.status, Status::Finalized);
    assert_eq!(m.outcome, Some(Outcome::Yes));
}

/// A loser must not be able to void a settled market by challenging late.
#[test]
#[should_panic(expected = "Too early")]
fn a_late_challenge_cannot_void_the_market() {
    let mut c = contract();
    at(T0, "creator.near", NearToken::from_near(2));
    let id = c.create_market(post("p1"), Side::Yes, rules(), draft(), Some(7 * 86_400));
    buy(&mut c, "yes.near", id, Side::Yes, 100 * USDC);
    buy(&mut c, "no.near", id, Side::No, 100 * USDC);
    receipt(&mut c, id, Side::Yes);
    at(EXPIRY + 7 * 86_400, "no.near", NearToken::from_near(1));
    c.challenge(id, "x".into());
    call(EXPIRY + 7 * 86_400, "no.near");
    c.claim_stuck(id);
}

#[test]
#[should_panic(expected = "Market is not stuck")]
fn claim_stuck_leaves_a_receipted_market_alone() {
    let mut c = contract();
    let id = two_sided(&mut c);
    receipt(&mut c, id, Side::Yes);
    call(EXPIRY + 7 * 86_400, "anyone.near");
    c.claim_stuck(id);
}

// ---- review fixes ----------------------------------------------------------

#[test]
#[should_panic(expected = "A reason is required")]
fn a_proposal_needs_a_reason() {
    let mut c = contract();
    let id = create(&mut c);
    call(EXPIRY + 1, "operator.near");
    c.post_receipt(id, Report::Proposed { outcome: Side::Yes, reason: String::new() }, evidence());
}

#[test]
#[should_panic(expected = "A NEAR AI reading is required")]
fn a_proposal_needs_an_ai_reading() {
    let mut c = contract();
    let id = create(&mut c);
    call(EXPIRY + 1, "operator.near");
    let e = Evidence { ai: None, ..evidence() };
    c.post_receipt(id, proposed(Side::Yes), e);
}

#[test]
fn an_invalid_report_needs_no_ai_reading() {
    let mut c = contract();
    let id = create(&mut c);
    call(EXPIRY + 1, "operator.near");
    let e = Evidence { ai: None, ..evidence() };
    let report = Report::Invalid { kind: InvalidKind::SourceUnavailable, reason: "offline".into() };
    c.post_receipt(id, report, e);
    assert_eq!(c.get_market(id).unwrap().receipt.unwrap().evidence.ai, None);
}

#[test]
#[should_panic(expected = "A reason is required")]
fn a_blank_reason_is_rejected() {
    let mut c = contract();
    let id = create(&mut c);
    call(EXPIRY + 1, "operator.near");
    c.post_receipt(id, Report::Proposed { outcome: Side::Yes, reason: "   ".into() }, evidence());
}

#[test]
#[should_panic(expected = "Evidence hash must be a sha256 hex digest")]
fn the_evidence_hash_must_be_a_digest() {
    let mut c = contract();
    let id = create(&mut c);
    call(EXPIRY + 1, "operator.near");
    let e = Evidence { hash: "junk".into(), ..evidence() };
    c.post_receipt(id, proposed(Side::Yes), e);
}

#[test]
#[should_panic(expected = "The AI reading is incomplete")]
fn the_ai_reading_must_be_complete() {
    let mut c = contract();
    let id = create(&mut c);
    call(EXPIRY + 1, "operator.near");
    let mut e = evidence();
    e.ai.as_mut().unwrap().signature = String::new();
    c.post_receipt(id, proposed(Side::Yes), e);
}

#[test]
#[should_panic(expected = "Conditions cannot be blank")]
fn blank_conditions_are_rejected() {
    let mut r = event_rules();
    r.yes_condition = "  ".into();
    create_with(r);
}

#[test]
#[should_panic(expected = "The resolution source must be an https URL")]
fn the_source_must_be_https() {
    let mut r = event_rules();
    r.resolution_source = "ftp://example.com".into();
    create_with(r);
}

#[test]
#[should_panic(expected = "Operator and arbiter must differ")]
fn operator_and_arbiter_must_differ() {
    let mut c = contract();
    call(T0, "owner.near");
    c.set_roles(None, Some(acc("operator.near")), None);
}

#[test]
fn the_default_challenge_window_floor_is_an_hour() {
    assert_eq!(Config::default().min_challenge_window_sec, 3_600);
}

/// A contract nearly out of spare NEAR refuses bets, but not a challenge.
#[test]
fn a_challenge_still_works_when_bets_have_filled_the_contract() {
    let mut c = contract();
    let id = two_sided(&mut c);
    receipt(&mut c, id, Side::Yes);
    let mut ctx = VMContextBuilder::new();
    ctx.current_account_id(acc("market.near"))
        .predecessor_account_id(acc("no.near"))
        .signer_account_id(acc("no.near"))
        .block_timestamp((EXPIRY + 2) * 1_000_000_000)
        .prepaid_gas(Gas::from_tgas(300))
        // 0.5 NEAR of storage, comfortably above what this test rewrites.
        .storage_usage(50_000)
        .attached_deposit(NearToken::from_near(1))
        // Storage + both bonds + the 0.1 floor, far short of the 1 NEAR bets must leave.
        .account_balance(NearToken::from_millinear(2_700));
    testing_env!(ctx.build());
    c.challenge(id, "x".into());
    assert_eq!(c.get_market(id).unwrap().status, Status::Challenged);
}

#[test]
#[should_panic(expected = "Evidence is too long")]
fn the_ai_reading_is_size_limited() {
    let mut c = contract();
    let id = create(&mut c);
    call(EXPIRY + 1, "operator.near");
    let mut e = evidence();
    e.ai.as_mut().unwrap().signature = "x".repeat(MAX_SHORT_TEXT + 1);
    c.post_receipt(id, proposed(Side::Yes), e);
}

#[test]
fn an_ambiguous_market_forfeits_nothing_but_the_bond() {
    let mut c = contract();
    let id = create(&mut c);
    buy(&mut c, "yes.near", id, Side::Yes, 100 * USDC);
    buy(&mut c, "no.near", id, Side::No, 100 * USDC);
    call(EXPIRY + 1, "operator.near");
    c.post_receipt(id, Report::Invalid { kind: InvalidKind::AmbiguousRules, reason: "x".into() }, evidence());
    finalize(&mut c, id);
    yocto(EXPIRY + 200, "yes.near");
    let _ = c.refund(id);
    assert_eq!(c.get_accounting().in_flight.0, 99_700_000);
}

#[test]
#[should_panic(expected = "A reason is required")]
fn invalid_needs_a_reason() {
    let mut c = contract();
    let id = create(&mut c);
    call(EXPIRY + 1, "operator.near");
    c.post_receipt(
        id,
        Report::Invalid { kind: InvalidKind::SourceUnavailable, reason: String::new() },
        evidence(),
    );
}

#[test]
#[should_panic(expected = "cannot challenge")]
fn the_arbiter_cannot_challenge() {
    let mut c = contract();
    let id = two_sided(&mut c);
    receipt(&mut c, id, Side::Yes);
    at(EXPIRY + 2, "arbiter.near", NearToken::from_near(1));
    c.challenge(id, "x".into());
}

#[test]
fn cancelling_frees_the_post_slot() {
    let mut c = contract();
    for _ in 0..5 {
        let id = create_on(&mut c, "p1");
        call(T0 + 1, "creator.near");
        c.cancel_market(id);
    }
    create_on(&mut c, "p1");
    assert_eq!(c.get_markets_for_posts(vec!["p1".into()])[0].1.len(), 1);
}

#[test]
fn selling_out_and_buying_again_lists_the_market_once() {
    let mut c = contract();
    let id = two_sided(&mut c);
    let shares = c.get_position(id, acc("yes.near")).yes_shares;
    yocto(T0 + 20, "yes.near");
    let _ = c.sell(id, Side::Yes, shares, U128(0));
    buy(&mut c, "yes.near", id, Side::Yes, 10 * USDC);
    assert_eq!(c.get_user_markets(acc("yes.near"), None, None).len(), 1);
}

#[test]
#[should_panic(expected = "Expiry is too far out")]
fn expiry_has_an_upper_bound() {
    let mut r = rules();
    r.expiry_sec = U64(u64::MAX);
    create_with(r);
}

#[test]
#[should_panic(expected = "Creator share is too high")]
fn config_is_validated() {
    call(T0, "owner.near");
    let config = Config { creator_share_bps: 10_001, ..Config::default() };
    let _ = Contract::new(
        acc("owner.near"),
        acc("operator.near"),
        acc("arbiter.near"),
        acc("treasury.near"),
        acc("usdc.near"),
        Some(config),
    );
}

fn with_balance(sec: u64, caller: &str, balance: NearToken) {
    let mut ctx = VMContextBuilder::new();
    ctx.current_account_id(acc("market.near"))
        .predecessor_account_id(acc(caller))
        .signer_account_id(acc(caller))
        .block_timestamp(sec * 1_000_000_000)
        .prepaid_gas(Gas::from_tgas(300))
        // The builder's default of 1 MB would dwarf every balance used here.
        .storage_usage(1_000)
        .account_balance(balance);
    testing_env!(ctx.build());
}

/// One bond is outstanding: a bet may not use the NEAR that backs it.
#[test]
#[should_panic(expected = "The contract needs more NEAR for storage")]
fn a_bet_cannot_eat_into_bonds() {
    let mut c = contract();
    let id = create(&mut c);
    with_balance(T0 + 10, "usdc.near", NearToken::from_millinear(1_500));
    let msg = format!(r#"{{"action":"buy","market_id":"{}","side":"yes","min_shares":"0"}}"#, id.0);
    let _ = c.ft_on_transfer(acc("yes.near"), U128(USDC as u128), msg);
}

#[test]
fn a_bet_goes_through_when_bonds_and_the_reserve_are_covered() {
    let mut c = contract();
    let id = create(&mut c);
    with_balance(T0 + 10, "usdc.near", NearToken::from_near(3));
    let msg = format!(r#"{{"action":"buy","market_id":"{}","side":"yes","min_shares":"0"}}"#, id.0);
    let _ = c.ft_on_transfer(acc("yes.near"), U128(USDC as u128), msg);
    assert_eq!(c.get_market(id).unwrap().trades, 1);
}

#[test]
fn free_near_excludes_bonds_and_the_reserve() {
    let mut c = contract();
    create(&mut c);
    with_balance(T0 + 10, "anyone.near", NearToken::from_near(5));
    let free = c.get_free_near().as_near();
    assert!(free >= 2 && free < 3, "free {free}");
}

#[test]
fn bonds_are_released_when_a_market_ends() {
    let mut c = contract();
    let id = two_sided(&mut c);
    assert_eq!(c.bonds_outstanding, NearToken::from_near(1).as_yoctonear());
    receipt(&mut c, id, Side::Yes);
    challenge(&mut c, id);
    assert_eq!(c.bonds_outstanding, NearToken::from_near(2).as_yoctonear());
    call(EXPIRY + 3, "arbiter.near");
    c.arbitrate(id, Decision::Uphold);
    assert_eq!(c.bonds_outstanding, 0);
}

// ---- claimable -------------------------------------------------------------

#[test]
fn withdraw_empties_claimable() {
    let mut c = contract();
    let id = create(&mut c);
    buy(&mut c, "yes.near", id, Side::Yes, 100 * USDC);
    yocto(T0 + 20, "treasury.near");
    let _ = c.withdraw();
    assert_eq!(c.get_claimable(acc("treasury.near")).0, 0);
    assert_eq!(c.get_accounting().in_flight.0, 270_000);
}

#[test]
#[should_panic(expected = "Nothing to withdraw")]
fn withdraw_needs_a_balance() {
    let mut c = contract();
    yocto(T0, "nobody.near");
    let _ = c.withdraw();
}

// ---- admin -----------------------------------------------------------------

#[test]
#[should_panic(expected = "Owner only")]
fn set_roles_is_owner_only() {
    let mut c = contract();
    call(T0, "operator.near");
    c.set_roles(Some(acc("x.near")), None, None);
}

#[test]
fn pause_does_not_block_exits() {
    let mut c = contract();
    let id = two_sided(&mut c);
    receipt(&mut c, id, Side::Yes);
    finalize(&mut c, id);
    call(EXPIRY + 150, "owner.near");
    c.set_paused(true);
    yocto(EXPIRY + 200, "yes.near");
    let _ = c.redeem(id);
    assert!(c.get_accounting().in_flight.0 > 0);
}

// ---- solvency --------------------------------------------------------------

struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }

    fn below(&mut self, n: u64) -> u64 {
        self.next() % n
    }
}

/// Random trading on random markets, then every exit. Whatever the order, the
/// contract never owes more than it took in, and leaves only rounding dust.
#[test]
fn solvency_holds_under_random_operations() {
    // The mocked chain keeps its storage per thread, so each run gets its own.
    for seed in 1..=20u64 {
        std::thread::spawn(move || run_random_operations(seed)).join().unwrap();
    }
}

fn run_random_operations(seed: u64) {
    const USERS: [&str; 4] = ["a.near", "b.near", "c.near", "d.near"];

    {
        let mut rng = Rng(seed.wrapping_mul(0x9E37_79B9_7F4A_7C15));
        let mut c = contract();
        let markets: Vec<U64> = (0..3).map(|i| create_on(&mut c, &format!("p{i}"))).collect();
        let mut taken = 0u128;

        for _ in 0..80 {
            let user = USERS[rng.below(4) as usize];
            let id = markets[rng.below(3) as usize];
            let side = if rng.below(2) == 0 { Side::Yes } else { Side::No };
            if rng.below(3) == 0 {
                let p = c.get_position(id, acc(user));
                let held = if side == Side::Yes { p.yes_shares.0 } else { p.no_shares.0 };
                if held > 0 {
                    let shares = 1 + rng.next() as u128 % held;
                    yocto(T0 + 20, user);
                    let cost = if side == Side::Yes { p.yes_cost.0 } else { p.no_cost.0 };
                    // Skip sells too small to pay out; the contract rejects them.
                    if cost * shares / held > 1 {
                        let _ = c.sell(id, side, U128(shares), U128(0));
                    }
                }
            } else {
                let amount = USDC + rng.below(500 * USDC);
                buy(&mut c, user, id, side, amount);
                taken += amount as u128;
            }
            assert_solvent(&c, taken, 0);
        }

        for (i, id) in markets.iter().enumerate() {
            match i {
                0 => receipt(&mut c, *id, Side::Yes),
                1 => receipt(&mut c, *id, Side::No),
                _ => {
                    call(EXPIRY + 1, "operator.near");
                    c.post_receipt(
                        *id,
                        Report::Invalid { kind: InvalidKind::SourceUnavailable, reason: "x".into() },
                        evidence(),
                    );
                }
            }
            finalize(&mut c, *id);
        }

        for id in &markets {
            let m = c.get_market(*id).unwrap();
            let redeem = matches!(m.outcome, Some(Outcome::Yes | Outcome::No))
                && m.total_yes.0 > 0
                && m.total_no.0 > 0;
            for user in USERS {
                let p = c.get_position(*id, acc(user));
                let stake = if redeem {
                    if m.outcome == Some(Outcome::Yes) { p.yes_cost.0 } else { p.no_cost.0 }
                } else {
                    p.yes_cost.0 + p.no_cost.0
                };
                if stake == 0 {
                    continue;
                }
                yocto(EXPIRY + 500, user);
                let _ = if redeem { c.redeem(*id) } else { c.refund(*id) };
                assert_solvent(&c, taken, 0);
            }
        }

        let a = c.get_accounting();
        let owed = a.total_pool_collateral.0 + a.total_claimable.0 + a.in_flight.0;
        assert!(owed <= taken);
        // Floor rounding on payouts stays in the pools; nothing else is lost.
        assert!(a.total_pool_collateral.0 < 100, "seed {seed}: left {}", a.total_pool_collateral.0);
        assert_eq!(owed, taken, "seed {seed}");
    }
}
