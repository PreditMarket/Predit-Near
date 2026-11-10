# Predit contracts on NEAR

Turn a social post into a YES/NO prediction market on NEAR. One contract holds the whole market: locked rules, a creation bond, USDC bets, a result receipt with evidence, a bonded challenge, payouts, and the post author's forecasting record.

Runs on NEAR testnet with a mock USDC. **Not audited: do not use with real money.**

## How a market works

1. `create_market` for a post, with a bond. The rules are locked and their hash stored.
2. Bet with USDC through `ft_transfer_call`; `sell` until the trade freeze.
3. After the deadline, the operator posts a `post_receipt`: outcome, reason, the source snapshot's hash, a link to the evidence, and the NEAR AI reading (model, chat id, signed text, signature, signing address).
4. Anyone can `challenge` within the window, with a bond. The `arbiter` upholds or overturns.
5. `finalize` settles, returns bonds and updates the author's record. Winners `redeem`; invalid, cancelled and one-sided markets `refund`.

Off chain, an agent snapshots the source at the deadline, NEAR AI (in a TEE) suggests the outcome, and an admin decides and signs with their NEAR wallet before the operator posts. The operator key is a function-call key limited to `post_receipt` and `finalize`.

## Layout

| Path | What it is |
|---|---|
| `market/` | The market contract |
| `core/` | Market maths, no chain dependency. Predit had it before the hackathon (baseline, not hackathon work) |
| `mock-usdc/` | Test NEP-141 with a faucet and a simulated deposit |
| `sandbox-tests/` | End-to-end tests on a local NEAR node |
| `testnet-e2e.sh`, `testnet-fullcase.py` | Suites against a deployed testnet contract |

## Try it

Needs Rust (pinned in `rust-toolchain.toml`) and [`cargo-near`](https://github.com/near/cargo-near) 0.23. No keys needed for the first two.

```bash
./build.sh      # target/near/predit_market/predit_market.wasm
cargo test      # 180 tests: maths, contract, full lifecycle on a local node
near contract call-function as-read-only predit-markets-market.testnet get_markets json-args '{}' network-config testnet now
```

Deploy your own copy and run the suites (needs [`near`](https://github.com/near/near-cli-rs) and funded testnet accounts):

```bash
FUNDER=<account> FUND_AMOUNT='6 NEAR' ./deploy-testnet.sh <prefix>
FUNDER=<account> ./testnet-e2e.sh <prefix>                     # about 3 minutes
FUNDERS=<a>,<b>,<c> python3 -I testnet-fullcase.py <prefix>    # about 36 minutes
```
