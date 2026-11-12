# Security notes

The contracts run on NEAR testnet with a mock USDC. **They are not audited. Do not use them with real money.**

Two independent reviews were run (the second after the Pyth price path was removed). Neither found a way for an outsider to take USDC directly.

## Fixed after review

| Id | Issue | Fix |
|---|---|---|
| H1 | A loser could challenge, then call `claim_stuck` to void a settled market | The stuck timer starts at the challenge; a silent arbiter leaves the receipt standing |
| H2 | Positions could spend the NEAR held for bonds and block `finalize` | `bonds_outstanding` is tracked; trades, receipts and challenges stop before touching bonds and a 1 NEAR reserve |
| H3 (part) | The operator could post a result or Invalid with no evidence | Every receipt needs evidence and a reason; a proposed result needs a sha256 source hash and a NEAR AI reading |
| M3 | Creating and cancelling 5 markets locked a post forever | Cancelling frees the post's slot |
| M4 (part) | The arbiter could challenge and judge its own challenge | The operator and arbiter cannot challenge, and must be different accounts |
| M5 | Views scanned everything and could run out of gas | Views page with `from_index`; counts have their own views |
| Low | Duplicate listings, unbounded expiry, unchecked config, blank rules, non-https sources | Rejected |

## Still open, to decide before real money

| Id | Issue | Direction |
|---|---|---|
| H3 | The contract cannot tell whether a result is true. A leaked operator key decides every result inside a short challenge window | Window sized to the market, or several signers |
| M1 | In the market maths (`contracts/core`): payout follows the cost paid, not the price, so a late buy is not priced out and a losing side can exit at cost until the freeze | Expiry before the event, longer freeze, or a price-weighted payout |
| M2 | `author_ref`, `post_id` and `claim_side` are declared by the creator; two accounts with 1 USDC each can score a post | Third-party proof of post and author, a minimum stake to count |
| M | The operator can call a market `AmbiguousRules` and send the creator's bond to the treasury without a challenge | Only after a successful challenge, or bond not paid to the treasury |
| M4 | The owner changes roles at once and cannot hand over ownership | Multisig and a timelock |
| Low | No state migration; receipt storage is paid by the contract; `simulate_deposit` exists only in the mock token | Before mainnet |

## Limits by design

- The creator picks which side the author took (`claim_side`); a challenge only disputes the result.
- The contract never calls an AI. It stores the source snapshot's hash and the NEAR AI signature so anyone can check them off chain with `pnpm verify`. The source is chosen by the creator, so prompt injection is possible: that is why a person confirms every result and anyone can challenge it.
- A market cannot settle before its deadline.

## Before mainnet

Collateral becomes Circle USDC on NEAR (`17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1`) and `mock-usdc` is not deployed. Add a per-order and per-market cap, keep the default challenge window (not `demo-config.json`), make the owner and arbiter a multisig, build with `cargo near build reproducible-wasm`, and run the testnet suites with small amounts first.
