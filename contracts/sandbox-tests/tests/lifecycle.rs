//! End-to-end tests on a local NEAR node, with real token transfers.

use near_workspaces::network::Sandbox;
use near_workspaces::types::{Gas, NearToken};
use near_workspaces::{Account, Contract, Worker};
use serde_json::{json, Value};

const USDC: u128 = 1_000_000;
const WINDOW: u32 = 5;
const LIFETIME: u64 = 20;

struct Env {
    worker: Worker<Sandbox>,
    usdc: Contract,
    market: Contract,
    operator: Account,
    arbiter: Account,
    treasury: Account,
    creator: Account,
    alice: Account,
    bob: Account,
}

async fn account(worker: &Worker<Sandbox>, name: &str) -> anyhow::Result<Account> {
    Ok(worker
        .root_account()?
        .create_subaccount(name)
        .initial_balance(NearToken::from_near(50))
        .transact()
        .await?
        .into_result()?)
}

async fn deploy(worker: &Worker<Sandbox>, name: &str, wasm: &str) -> anyhow::Result<Contract> {
    let code = std::fs::read(format!("../target/near/{wasm}"))?;
    Ok(account(worker, name).await?.deploy(&code).await?.into_result()?)
}

async fn faucet(usdc: &Contract, who: &Account) -> anyhow::Result<()> {
    who.call(usdc.id(), "faucet").transact().await?.into_result()?;
    Ok(())
}

async fn setup() -> anyhow::Result<Env> {
    let worker = near_workspaces::sandbox().await?;
    let usdc = deploy(&worker, "usdc", "predit_mock_usdc/predit_mock_usdc.wasm").await?;
    usdc.call("new").transact().await?.into_result()?;
    let market = deploy(&worker, "market", "predit_market/predit_market.wasm").await?;

    let operator = account(&worker, "operator").await?;
    let arbiter = account(&worker, "arbiter").await?;
    let treasury = account(&worker, "treasury").await?;
    let creator = account(&worker, "creator").await?;
    let alice = account(&worker, "alice").await?;
    let bob = account(&worker, "bob").await?;

    market
        .call("new")
        .args_json(json!({
            "owner": treasury.id(),
            "operator": operator.id(),
            "arbiter": arbiter.id(),
            "treasury": treasury.id(),
            "collateral": usdc.id(),
            "config": {
                "creation_bond": NearToken::from_near(1).as_yoctonear().to_string(),
                "challenge_bond": NearToken::from_near(1).as_yoctonear().to_string(),
                "default_challenge_window_sec": WINDOW,
                "min_challenge_window_sec": 1,
                "max_challenge_window_sec": 3600,
                "stuck_after_sec": 3600,
                "min_buy": "1000000",
                "max_markets_per_post": 5,
                "trade_fee_bps": 30,
                "redeem_fee_bps": 100,
                "creator_share_bps": 1000,
                "trade_freeze_sec": 1,
                "virtual_liquidity_l": "500000000"
            }
        }))
        .transact()
        .await?
        .into_result()?;

    // The market must hold a USDC balance to receive bets.
    faucet(&usdc, market.as_account()).await?;
    for who in [&alice, &bob, &treasury, &creator] {
        faucet(&usdc, who).await?;
    }
    Ok(Env { worker, usdc, market, operator, arbiter, treasury, creator, alice, bob })
}

impl Env {
    async fn now(&self) -> anyhow::Result<u64> {
        Ok(self.worker.view_block().await?.timestamp() / 1_000_000_000)
    }

    async fn advance_to(&self, sec: u64) -> anyhow::Result<()> {
        while self.now().await? < sec {
            self.worker.fast_forward(50).await?;
        }
        Ok(())
    }

    async fn create(&self, post_id: &str) -> anyhow::Result<(u64, u64)> {
        self.create_market(post_id, "Yes", "No").await
    }

    async fn create_market(
        &self,
        post_id: &str,
        yes_label: &str,
        no_label: &str,
    ) -> anyhow::Result<(u64, u64)> {
        let expiry = self.now().await? + LIFETIME;
        let id: String = self
            .creator
            .call(self.market.id(), "create_market")
            .args_json(json!({
                "post": { "source": "x", "post_id": post_id, "author_ref": "x:alice", "text": "SOL will exceed $250" },
                "claim_side": "yes",
                "rules": {
                    "question": "Will SOL close above 250?",
                    "description": "From a post on X",
                    "yes_label": yes_label,
                    "no_label": no_label,
                    "category": "Crypto",
                    "image_url": "",
                    "yes_condition": "Source shows SOL at or above 250",
                    "no_condition": "Source shows SOL below 250",
                    "resolution_source": "https://www.coingecko.com/en/coins/solana",
                    "invalid_conditions": "The source shows no price",
                    "expiry_sec": expiry.to_string()
                },
                "draft": { "model": "glm", "chat_id": "chat-1" },
                "challenge_window_sec": WINDOW
            }))
            .deposit(NearToken::from_near(2))
            .max_gas()
            .transact()
            .await?
            .into_result()?
            .json()?;
        Ok((id.parse()?, expiry))
    }

    async fn buy(&self, who: &Account, id: u64, side: &str, amount: u128) -> anyhow::Result<()> {
        who.call(self.usdc.id(), "ft_transfer_call")
            .args_json(json!({
                "receiver_id": self.market.id(),
                "amount": amount.to_string(),
                "msg": json!({ "action": "buy", "market_id": id.to_string(), "side": side, "min_shares": "0" }).to_string()
            }))
            .deposit(NearToken::from_yoctonear(1))
            .max_gas()
            .transact()
            .await?
            .into_result()?;
        Ok(())
    }

    async fn receipt(&self, id: u64, expiry: u64, outcome: &str) -> anyhow::Result<()> {
        self.advance_to(expiry + 1).await?;
        self.operator
            .call(self.market.id(), "post_receipt")
            .args_json(json!({
                "market_id": id.to_string(),
                "report": { "proposed": { "outcome": outcome, "reason": "Confirmed from the source" } },
                "evidence": { "hash": "abcd", "uri": "https://example.com/snapshot",
                              "ai": { "model": "glm", "chat_id": "c1", "signature": "0xsigned" } }
            }))
            .transact()
            .await?
            .into_result()?;
        Ok(())
    }

    async fn finalize(&self, id: u64) -> anyhow::Result<()> {
        let posted = self.get_market(id).await?["receipt"]["posted_at_sec"]
            .as_str()
            .unwrap()
            .parse::<u64>()?;
        self.advance_to(posted + WINDOW as u64 + 1).await?;
        self.bob
            .call(self.market.id(), "finalize")
            .args_json(json!({ "market_id": id.to_string() }))
            .transact()
            .await?
            .into_result()?;
        Ok(())
    }

    async fn get_market(&self, id: u64) -> anyhow::Result<Value> {
        Ok(self
            .market
            .view("get_market")
            .args_json(json!({ "market_id": id.to_string() }))
            .await?
            .json()?)
    }

    async fn balance(&self, who: &near_workspaces::AccountId) -> anyhow::Result<u128> {
        let v: String = self
            .usdc
            .view("ft_balance_of")
            .args_json(json!({ "account_id": who }))
            .await?
            .json()?;
        Ok(v.parse()?)
    }

    async fn claimable(&self, who: &Account) -> anyhow::Result<u128> {
        let v: String = self
            .market
            .view("get_claimable")
            .args_json(json!({ "account_id": who.id() }))
            .await?
            .json()?;
        Ok(v.parse()?)
    }

    /// The market's USDC balance must cover everything it owes.
    async fn assert_solvent(&self, faucet_balance: u128) -> anyhow::Result<Value> {
        let a: Value = self.market.view("get_accounting").await?.json()?;
        let field = |k: &str| a[k].as_str().unwrap().parse::<u128>().unwrap();
        let owed = field("total_pool_collateral") + field("total_claimable") + field("in_flight");
        let held = self.balance(self.market.id()).await? - faucet_balance;
        assert!(owed <= held, "owes {owed}, holds {held}");
        assert_eq!(field("in_flight"), 0, "a payout never settled");
        Ok(a)
    }

    async fn near(&self, who: &Account) -> anyhow::Result<u128> {
        Ok(who.view_account().await?.balance.as_yoctonear())
    }
}

const FAUCET: u128 = 100 * USDC;

async fn pay(who: &Account, market: &Contract, method: &str, id: Option<u64>) -> anyhow::Result<bool> {
    let args = id.map_or(json!({}), |i| json!({ "market_id": i.to_string() }));
    Ok(who
        .call(market.id(), method)
        .args_json(args)
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(150))
        .transact()
        .await?
        .is_success())
}

#[tokio::test]
async fn full_lifecycle_pays_the_winner_and_updates_the_record() -> anyhow::Result<()> {
    let e = setup().await?;
    let (id, expiry) = e.create("p1").await?;
    e.buy(&e.alice, id, "yes", 50 * USDC).await?;
    e.buy(&e.bob, id, "no", 50 * USDC).await?;
    e.assert_solvent(FAUCET).await?;

    let creator_before = e.near(&e.creator).await?;
    e.receipt(id, expiry, "yes").await?;
    e.finalize(id).await?;

    let m = e.get_market(id).await?;
    assert_eq!(m["status"], "finalized");
    assert_eq!(m["outcome"], "yes");
    let bond_back = e.near(&e.creator).await? - creator_before;
    assert_eq!(bond_back, NearToken::from_near(1).as_yoctonear());

    let record: Value = e
        .market
        .view("get_record")
        .args_json(json!({ "author_ref": "x:alice" }))
        .await?
        .json()?;
    assert_eq!(record, json!({ "correct": 1, "wrong": 0 }));

    assert!(pay(&e.alice, &e.market, "redeem", Some(id)).await?);
    // Stakes 49.85 + 49.85 net of the 0.3% fee; 1% redeem fee on the pot.
    let pot = 99_700_000u128;
    let expected = FAUCET - 50 * USDC + pot - pot.div_ceil(100);
    assert_eq!(e.balance(e.alice.id()).await?, expected);
    assert!(!pay(&e.bob, &e.market, "redeem", Some(id)).await?);

    // Fees earned leave through withdraw.
    let fee = e.claimable(&e.treasury).await?;
    assert!(fee > 0);
    let before = e.balance(e.treasury.id()).await?;
    assert!(pay(&e.treasury, &e.market, "withdraw", None).await?);
    assert_eq!(e.balance(e.treasury.id()).await?, before + fee);
    e.assert_solvent(FAUCET).await?;
    Ok(())
}

#[tokio::test]
async fn an_event_market_settles_from_the_operator_proposal() -> anyhow::Result<()> {
    let e = setup().await?;
    let (id, expiry) = e.create_market("p1", "Lakers", "Celtics").await?;
    e.buy(&e.alice, id, "yes", 50 * USDC).await?;
    e.buy(&e.bob, id, "no", 50 * USDC).await?;
    e.advance_to(expiry + 1).await?;

    e.operator
        .call(e.market.id(), "post_receipt")
        .args_json(json!({
            "market_id": id.to_string(),
            "report": { "proposed": { "outcome": "no", "reason": "Final score 102-110" } },
            "evidence": { "hash": "abcd", "uri": "https://www.nba.com/scores", "ai": null }
        }))
        .transact()
        .await?
        .into_result()?;
    e.finalize(id).await?;

    let m = e.get_market(id).await?;
    assert_eq!(m["outcome"], "no");
    assert_eq!(m["rules"]["yes_label"], "Lakers");
    assert!(pay(&e.bob, &e.market, "redeem", Some(id)).await?);
    assert!(!pay(&e.alice, &e.market, "redeem", Some(id)).await?);
    e.assert_solvent(FAUCET).await?;
    Ok(())
}

#[tokio::test]
async fn sell_returns_the_stake_through_the_token() -> anyhow::Result<()> {
    let e = setup().await?;
    let (id, _) = e.create("p1").await?;
    e.buy(&e.alice, id, "yes", 50 * USDC).await?;
    let p: Value = e
        .market
        .view("get_position")
        .args_json(json!({ "market_id": id.to_string(), "account_id": e.alice.id() }))
        .await?
        .json()?;
    let ok = e
        .alice
        .call(e.market.id(), "sell")
        .args_json(json!({ "market_id": id.to_string(), "side": "yes", "shares": p["yes_shares"], "min_out": "0" }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(150))
        .transact()
        .await?;
    assert!(ok.is_success(), "{:?}", ok.failures());
    // 0.3% on the way in (150_000), 0.3% of the remaining stake on the way out.
    let net_in = 50 * USDC - 150_000;
    let fee_out = 149_550;
    assert_eq!(e.balance(e.alice.id()).await?, FAUCET - 50 * USDC + net_in - fee_out);
    e.assert_solvent(FAUCET).await?;
    Ok(())
}

#[tokio::test]
async fn a_failed_payout_becomes_claimable() -> anyhow::Result<()> {
    let e = setup().await?;
    let (id, _) = e.create("p1").await?;
    e.buy(&e.alice, id, "yes", 50 * USDC).await?;
    let p: Value = e
        .market
        .view("get_position")
        .args_json(json!({ "market_id": id.to_string(), "account_id": e.alice.id() }))
        .await?
        .json()?;

    // Alice leaves the token, so the payout cannot be delivered.
    e.alice
        .call(e.usdc.id(), "storage_unregister")
        .args_json(json!({ "force": true }))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    // The transaction reports the failed transfer; the contract absorbs it.
    let _ = e
        .alice
        .call(e.market.id(), "sell")
        .args_json(json!({ "market_id": id.to_string(), "side": "yes", "shares": p["yes_shares"], "min_out": "0" }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(150))
        .transact()
        .await?;

    let owed = e.claimable(&e.alice).await?;
    assert!(owed > 0, "the failed payout must be claimable");
    e.assert_solvent(FAUCET).await?;

    // Back on the token, she can collect it.
    e.alice
        .call(e.usdc.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?
        .into_result()?;
    assert!(pay(&e.alice, &e.market, "withdraw", None).await?);
    assert_eq!(e.balance(e.alice.id()).await?, owed);
    assert_eq!(e.claimable(&e.alice).await?, 0);
    Ok(())
}

#[tokio::test]
async fn a_fake_token_cannot_buy() -> anyhow::Result<()> {
    let e = setup().await?;
    let (id, _) = e.create("p1").await?;
    let fake = deploy(&e.worker, "fake", "predit_mock_usdc/predit_mock_usdc.wasm").await?;
    fake.call("new").transact().await?.into_result()?;
    faucet(&fake, &e.alice).await?;
    faucet(&fake, e.market.as_account()).await?;

    let _ = e
        .alice
        .call(fake.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": e.market.id(),
            "amount": (50 * USDC).to_string(),
            "msg": json!({ "action": "buy", "market_id": id.to_string(), "side": "yes", "min_shares": "0" }).to_string()
        }))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await?;

    let m = e.get_market(id).await?;
    assert_eq!(m["trades"], 0);
    let refunded: String = fake
        .view("ft_balance_of")
        .args_json(json!({ "account_id": e.alice.id() }))
        .await?
        .json()?;
    assert_eq!(refunded, FAUCET.to_string());
    Ok(())
}

async fn challenged(e: &Env) -> anyhow::Result<u64> {
    let (id, expiry) = e.create("p1").await?;
    e.buy(&e.alice, id, "yes", 50 * USDC).await?;
    e.buy(&e.bob, id, "no", 50 * USDC).await?;
    e.receipt(id, expiry, "yes").await?;
    e.bob
        .call(e.market.id(), "challenge")
        .args_json(json!({ "market_id": id.to_string(), "reason_uri": "https://example.com" }))
        .deposit(NearToken::from_near(1))
        .transact()
        .await?
        .into_result()?;
    Ok(id)
}

#[tokio::test]
async fn a_lost_challenge_forfeits_the_bond() -> anyhow::Result<()> {
    let e = setup().await?;
    let id = challenged(&e).await?;
    let treasury_before = e.near(&e.treasury).await?;
    e.arbiter
        .call(e.market.id(), "arbitrate")
        .args_json(json!({ "market_id": id.to_string(), "decision": "uphold" }))
        .transact()
        .await?
        .into_result()?;
    assert_eq!(
        e.near(&e.treasury).await? - treasury_before,
        NearToken::from_near(1).as_yoctonear()
    );
    assert_eq!(e.get_market(id).await?["outcome"], "yes");
    Ok(())
}

#[tokio::test]
async fn a_won_challenge_flips_the_winner_and_returns_the_bond() -> anyhow::Result<()> {
    let e = setup().await?;
    let id = challenged(&e).await?;
    // Unused gas from Bob's last transaction is refunded a few blocks later.
    e.worker.fast_forward(10).await?;
    let bob_before = e.near(&e.bob).await?;
    e.arbiter
        .call(e.market.id(), "arbitrate")
        .args_json(json!({ "market_id": id.to_string(), "decision": { "overturn": "no" } }))
        .transact()
        .await?
        .into_result()?;
    assert_eq!(e.near(&e.bob).await? - bob_before, NearToken::from_near(1).as_yoctonear());
    assert_eq!(e.get_market(id).await?["outcome"], "no");
    assert!(pay(&e.bob, &e.market, "redeem", Some(id)).await?);
    assert!(!pay(&e.alice, &e.market, "redeem", Some(id)).await?);
    e.assert_solvent(FAUCET).await?;
    Ok(())
}

#[tokio::test]
async fn a_silent_arbiter_cannot_turn_a_challenge_into_a_void() -> anyhow::Result<()> {
    let e = setup().await?;
    let id = challenged(&e).await?;
    // stuck_after_sec is 3600 in this setup, so it is too early right after the challenge.
    let early = e
        .bob
        .call(e.market.id(), "claim_stuck")
        .args_json(json!({ "market_id": id.to_string() }))
        .transact()
        .await?;
    assert!(early.is_failure());
    assert_eq!(e.get_market(id).await?["status"], "challenged");
    Ok(())
}

#[tokio::test]
async fn only_the_token_account_can_simulate_a_deposit() -> anyhow::Result<()> {
    let e = setup().await?;
    let newcomer = account(&e.worker, "newcomer").await?;
    let args = json!({ "account_id": newcomer.id(), "amount": (25 * USDC).to_string() });

    let denied = e.alice.call(e.usdc.id(), "simulate_deposit").args_json(args.clone()).transact().await?;
    assert!(denied.is_failure());

    e.usdc.call("simulate_deposit").args_json(args).transact().await?.into_result()?;
    assert_eq!(e.balance(newcomer.id()).await?, 25 * USDC);
    Ok(())
}

#[tokio::test]
async fn cancelling_refunds_the_stake_and_the_bond() -> anyhow::Result<()> {
    let e = setup().await?;
    let (id, _) = e.create("p1").await?;
    e.buy(&e.alice, id, "yes", 50 * USDC).await?;
    let creator_before = e.near(&e.creator).await?;
    e.treasury
        .call(e.market.id(), "cancel_market")
        .args_json(json!({ "market_id": id.to_string() }))
        .transact()
        .await?
        .into_result()?;
    assert_eq!(e.near(&e.creator).await? - creator_before, NearToken::from_near(1).as_yoctonear());
    assert!(pay(&e.alice, &e.market, "refund", Some(id)).await?);
    assert_eq!(e.balance(e.alice.id()).await?, FAUCET - 150_000);
    e.assert_solvent(FAUCET).await?;
    Ok(())
}

#[tokio::test]
async fn the_operator_cannot_arbitrate() -> anyhow::Result<()> {
    let e = setup().await?;
    let (id, _) = e.create("p1").await?;
    let denied = e
        .operator
        .call(e.market.id(), "arbitrate")
        .args_json(json!({ "market_id": id.to_string(), "decision": "uphold" }))
        .transact()
        .await?;
    assert!(denied.is_failure());
    Ok(())
}
