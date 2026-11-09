# Predit social prediction contracts (NEAR)

Smart contracts for turning a social post into a YES/NO prediction market on NEAR. One contract holds the whole lifecycle: rules locked at creation, a creation bond, USDC bets, a result receipt with evidence, a bonded challenge, redemption, and the forecasting record of the post's author.

Built at NEAR HACKATHON. Runs on NEAR testnet with a mock USDC. **It has not been audited and should not hold real money.**

## Lifecycle

1. Anyone calls `create_market` for a post, attaching a bond. The rules are locked from then on and the contract stores their hash.
2. Users bet by sending USDC with `ft_transfer_call`.
3. After expiry, off-chain NEAR AI reads the source named in the rules and suggests a result. A person confirms it, and the `operator` calls `post_receipt` with a reason and evidence. The contract never calls the AI.
4. Anyone can `challenge` the receipt for a bond during the challenge window. An `arbiter` then upholds or overturns it.
5. `finalize` settles the market, returns bonds and updates the author's record. Winners call `redeem`; invalid, cancelled and one-sided markets `refund`.

## Layout

| Path | What it is |
|---|---|
| `core/` | Market maths with no chain dependency |
| `market/` | The NEAR contract |
| `mock-usdc/` | Test NEP-141 with a faucet and a simulated deposit. Testnet only |
| `sandbox-tests/` | End-to-end tests on a local NEAR node |
| `testnet-e2e.sh`, `testnet-fullcase.py` | Runs against a deployed testnet contract |

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

## Trust model and known limits

- The contract cannot tell whether a result is true. It relies on NEAR AI's reading, a person confirming it, the challenge window and the arbiter.
- Whoever holds the operator key decides results, limited only by the challenge window. The deployed operator key is a NEAR function-call key restricted to `post_receipt` and `finalize`: it cannot transfer anything itself, but its receipts decide who wins.
- The default minimum challenge window is 1 hour. The demo deployment uses 60 seconds (`demo-config.json`) so a full round fits in a video.
- A result must carry the hash of the source snapshot and a NEAR AI reading (model, signed text, signature, signing address). The contract checks these are present and well formed, not that they are genuine: that check runs off-chain against NEAR AI's attestation. It shows what the AI read and answered, not that the result is correct.
- Because the source is named by the market's creator, its content can try to manipulate the model. That is why a person confirms every result.
- Late bets are not penalised and bettors can exit at cost until the freeze window, a property of the cost-basis design.
- The post's author and the side they took are declared by the market's creator, so a forecasting record can be manipulated.
- There are no position limits and no migration path.
