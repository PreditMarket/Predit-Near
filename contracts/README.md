# Predit social prediction contracts (NEAR)

Smart contracts for turning a social post into a YES/NO prediction market on NEAR. One contract holds the whole lifecycle: rules locked at creation, a creation bond, USDC bets, a result receipt with evidence, a bonded challenge, redemption, and the forecasting record of the post's author.

Built at NEAR HACKATHON. Runs on NEAR testnet with a mock USDC. **It has not been audited and should not hold real money.**

## Lifecycle

1. Anyone calls `create_market` for a post, attaching a bond. The rules (question, YES/NO conditions, source, deadline, invalid conditions) are locked from then on and the contract stores their hash. The post's author and the side they took are recorded with the market.
2. Users bet by sending USDC with `ft_transfer_call`, and can `sell` back until the trade freeze before the deadline.
3. After the deadline the result is decided off chain, then posted on chain (see [How a result is reached](#how-a-result-is-reached)). The `operator` calls `post_receipt` with the outcome, a reason and evidence. The contract never calls the AI.
4. Anyone can `challenge` the receipt for a bond during the challenge window. An `arbiter` then upholds or overturns it.
5. `finalize` settles the market once the window has passed, returns bonds and updates the author's record. Winners call `redeem`; invalid, cancelled and one-sided markets `refund`.

## How a result is reached

The Predit web app runs this part next to its server. The contract only sees the receipt at the end.

1. **Snapshot.** When a market's deadline passes, an agent reads the source page named in the rules once and keeps that text. Its SHA-256 hash is what goes on chain.
2. **NEAR AI reading.** The agent asks a model on NEAR AI Cloud, running in a TEE, to settle the market from that snapshot alone: YES, NO or Invalid, with a reason. It keeps the exact request and response bytes and the enclave's ECDSA signature over their hashes.
3. **A person decides.** An admin reviews the snapshot and the suggestion, picks the outcome (which may differ from the AI's) and signs the decision with their own NEAR wallet (NEP-413). The server checks that signature against a full-access key of an admin account.
4. **Receipt.** The operator key, a function-call key limited to `post_receipt` and `finalize`, posts the receipt: the outcome, the reason, the snapshot hash, a public link to the evidence and the NEAR AI reading (model, chat id, signed text, signature, signing address).
5. **Finalize.** When the challenge window has passed without a dispute, the agent calls `finalize`. Anyone else may call it too.

Anyone can recheck a receipt without an account or key: the web app's `pnpm verify <market id>` downloads the evidence, checks the snapshot against the hash on chain, checks the signed request and response hashes, checks that the model was sent this snapshot and this market's question, and recovers the signature's address.

## What the web app calls

| Who | Method |
|---|---|
| Creator | `create_market` (attaches the bond plus a storage margin, refunded when unused) |
| Bettor | `ft_transfer_call` on the USDC token with a `buy` message, `sell`, `redeem`, `refund`, `withdraw` |
| Anyone | `challenge` (attaches the challenge bond), `finalize` |
| Operator | `post_receipt`, `finalize` |
| Arbiter | `arbitrate` (from the CLI) |
| Views | `get_market`, `get_markets`, `get_markets_for_posts`, `get_position`, `get_user_markets`, `get_record`, `get_claimable`, `get_due_markets`, `get_finalizable`, `get_config` |

## Layout

| Path | What it is |
|---|---|
| `core/` | Market maths with no chain dependency |
| `market/` | The NEAR contract |
| `mock-usdc/` | Test NEP-141 with a faucet and a simulated deposit. Testnet only |
| `sandbox-tests/` | End-to-end tests on a local NEAR node |
| `testnet-e2e.sh`, `testnet-fullcase.py` | Runs against a deployed testnet contract |
| `NOTES.md` | Design notes, the security reviews, and what to do before mainnet |

## What was built before the hackathon

`core/` is baseline code from before the hackathon, not hackathon work. Everything else here was written for this hackathon, with AI assistance (Claude Code).

Economically `core` is a cost-basis parimutuel: payouts depend on the collateral staked. The constant-product curve only produces the displayed price, so this is not an AMM.

## Try it

Requires Rust (the version is pinned in `rust-toolchain.toml`) and [`cargo-near`](https://github.com/near/cargo-near) 0.23. No keys or accounts are needed for the first two steps.

| Do | See |
|---|---|
| `./build.sh` | `target/near/predit_market/predit_market.wasm` and the mock token wasm |
| `cargo test` | 180 tests pass: market maths, contract logic and a full lifecycle on a local NEAR node |
| `near contract call-function as-read-only predit-markets-market.testnet get_config json-args '{}' network-config testnet now` | The deployed contract's configuration |
| `near contract call-function as-read-only predit-markets-market.testnet get_markets json-args '{}' network-config testnet now` | Markets on the deployed contract, including receipts and evidence |
| `near contract call-function as-read-only predit-markets-market.testnet get_record json-args '{"author_ref":"x:APompliano"}' network-config testnet now` | A post author's forecasting record |

To deploy your own copy and run the suites (needs [`near`](https://github.com/near/near-cli-rs) and funded testnet accounts; the public faucet rate-limits quickly, so set `FUNDER`):

```bash
FUNDER=<account> FUND_AMOUNT='6 NEAR' ./deploy-testnet.sh <prefix>
FUNDER=<account> ./testnet-e2e.sh <prefix>                     # about 3 minutes
FUNDERS=<a>,<b>,<c> python3 -I testnet-fullcase.py <prefix>    # about 36 minutes, keep the machine awake
```

## Deployed on testnet

| Contract | Account |
|---|---|
| Market | `predit-markets-market.testnet` |
| Mock USDC | `predit-markets-usdc.testnet` |

The deployed market code is the SHA-256 `f447aac6786a81ba7abfb130c4e65684fff31e4461f7d34c6fef60ad3051b38e` (base58 `HSZrwNvTurfWaQXN9NE9pCVJjcZYk7qh9gVu2YJucujb`), that of `predit_market.wasm` built from this folder on the author's machine. `near account view-account-summary predit-markets-market.testnet network-config testnet now` shows it; compare with `shasum -a 256 target/near/predit_market/predit_market.wasm`. A build elsewhere may differ byte for byte unless it uses the same toolchain.

## Trust model and known limits

- The contract cannot tell whether a result is true. It relies on NEAR AI's reading, a person confirming it, the challenge window and the arbiter.
- Whoever holds the operator key decides results, limited only by the challenge window. The deployed operator key is a NEAR function-call key restricted to `post_receipt` and `finalize`: it cannot transfer anything itself, but its receipts decide who wins. The web app only uses it after an admin has signed the decision.
- The default minimum challenge window is 1 hour. The demo deployment uses 60 seconds (`demo-config.json`) so a full round fits in a video.
- A result must carry the hash of the source snapshot and, for YES or NO, a NEAR AI reading (model, signed text, signature, signing address). The contract checks these are present and well formed, not that they are genuine: `pnpm verify` checks that off chain. It shows what the AI read and answered, not that the result is correct. Matching the signing address to NEAR AI's TEE attestation report is a separate, optional step (`pnpm verify` does it when given a NEAR AI key, or paste the chat id at cloud.near.ai/verify).
- The snapshot is the text a page reader returned at the deadline, not the page itself. Pages that block readers, or render their data with scripts, can come back empty or wrong; the AI then suggests Invalid (source unavailable), and a person still decides.
- Because the source is named by the market's creator, its content can try to manipulate the model. That is why a person confirms every result.
- Invalid for ambiguous rules forfeits the creator's bond; every other outcome returns it.
- Late bets are not penalised and bettors can exit at cost until the freeze window, a property of the cost-basis design.
- The post's author and the side they took are declared by the market's creator, so a forecasting record can be manipulated. A one-sided market is refunded and does not count toward the record.
- There are no position limits and no migration path.
