# Predit on NEAR

**A social feed where every claim can become a prediction market.** A post on X says "NEAR will close above $10 this year" or "submissions will pass 300 by Friday". On Predit anyone can turn that sentence into a YES/NO market under the post in one transaction. People take positions in USDC, so the market price shows what the crowd currently believes. At the deadline the result is settled on NEAR from a signed NEAR AI reading of the source and a person's decision. The result is then written back to the post and to its author's public record.

The feed stops being a stream of opinions. It becomes a **live knowledge layer**: each claim shows its current odds while it is open and its verdict once it settles, and each account carries a track record kept by the contract.

Built for NEAR HACKATHON (track: Open). Runs on **NEAR testnet** with a mock USDC.

| | |
|---|---|
| Contract | [`predit-markets-market.testnet`](https://testnet.nearblocks.io/address/predit-markets-market.testnet) |
| Test USDC | [`predit-markets-usdc.testnet`](https://testnet.nearblocks.io/address/predit-markets-usdc.testnet) |

## The problem

Feeds are full of confident claims about prices, launches, numbers and dates. Nobody checks them afterwards. A wrong call costs its author nothing and a right one earns no lasting credit, so a reader cannot tell which accounts have actually been right. Existing prediction markets sit on separate sites, with questions written by the platform, not by the people making the claims.

## What Predit does

1. **Feed.** Posts from X, each with its own markets underneath: the question, the current YES/NO odds, and a one-tap "Place a prediction".
2. **Claim → market.** NEAR AI reads a post, says whether it contains a checkable prediction and drafts the rules: question, outcomes, deadline, the source that will decide it, and which side the author took. The creator reviews every field, then one `create_market` transaction locks the rules on chain.
3. **Positions.** USDC goes straight into the contract with `ft_transfer_call`. Prices come from a CPMM pool, and you can sell until the trade freeze.
4. **Result.** At the deadline an agent snapshots the source and NEAR AI reads it inside a TEE, returning a signed answer. An admin confirms or overrides it with a NEP-413 wallet signature. A limited operator key posts the receipt: outcome, reason, snapshot hash and the AI signature. Anyone can challenge it with a bond during the challenge window.
5. **Back to the feed.** Finalized markets pay out. The post shows Right or Wrong, and the author's record (`/u/@handle`) counts it once per post, as the contract decides.
6. **Check it yourself.** `pnpm verify <market id>` recomputes the rules, snapshot, request and response hashes from public data and checks that the NEAR AI signature recovers to the signer recorded on chain, with no key. Proving that signer is a NEAR AI TEE key needs a NEAR AI key or [cloud.near.ai/verify](https://cloud.near.ai/verify).

Around this sit a Predit AI chat that answers only from the app's own markets and posts (answered by NEAR AI and showing its signer), a portfolio, and deposit/withdraw.

## Try it

Needs Node 20+ and pnpm (`corepack enable`). No keys or accounts.

```bash
./demo.sh                # install, verify a settled market from the chain, unit tests, start on :3000
./demo.sh --e2e          # also the Playwright suite (reads testnet, signs nothing)
./demo.sh --contracts    # also build the contracts and run the Rust tests (needs Rust and cargo-near 0.23)
```

`demo.sh` first runs `pnpm verify 38`, which checks a real receipt on testnet against its public evidence link (or the copy in `evidence/38.json` if the hosted app is down):

```
PASS  Rules match the hash locked at creation
PASS  Snapshot matches the hash on chain
PASS  Evidence is for this market
PASS  Snapshot is of the source locked in the rules
PASS  Signed request hash matches the published request
PASS  Signed response hash matches the published response
PASS  The model was sent this snapshot
PASS  The model was asked about this market
PASS  Signature recovers to the signer on chain
```

It then changes one word in the snapshot and shows the same check failing.

Then open http://localhost:3000:

| Do | See | Needs |
|---|---|---|
| Scroll the home feed | Posts with their markets and live odds, read from the contract | Sample posts without `TWITTER_API_KEY`; their markets are real |
| Open `/market/38` | A settled market made from a post by Vitalik Buterin: rules drafted by NEAR AI, created by a new account through Intear Wallet, the result receipt, the NEAR AI reading of ultrasound.money, the public evidence | Nothing |
| Open `/u/NEARProtocol` | The author record the contract keeps: hit rate, every post that became a market, which market counted | Nothing |
| Connect a NEAR testnet wallet | The balance pill; a new account gets 0.25 testnet NEAR for gas and storage | Gas only with `NEAR_ONBOARD_*`; otherwise use the testnet faucet |
| Balance pill → Deposit → NEAR → "Get 100 tUSDC from the faucet" | 100 tUSDC from the mock token's faucet in your wallet (once an hour) | Nothing |
| Deposit → Other chains → pick a chain and an amount | The deposit steps, then the tUSDC credited on NEAR (simulated, see below) | `NEAR_USDC_*` |
| Tap a market's question under a post → Place a prediction | One `ft_transfer_call`; the position appears in Portfolio | Nothing |
| Create market on a post with none | One `create_market` puts the market under the post | NEAR AI fills the form with `NEAR_AI_API_KEY`; otherwise fill it by hand |
| With a wallet connected, ask Predit AI (right column) "what is the hottest market?" | An answer built from the app's markets, with cards to open them and the NEAR AI signer under it | `NEAR_AI_API_KEY` |

The variables are listed in [`apps/web/.env.example`](apps/web/.env.example). `PORT=3100 ./demo.sh` starts on another port.

### About the testnet data

The markets on the testnet contract were created by the team to test the app and film the demo. Their deadlines are minutes away, not months, and the contract runs with a 60-second challenge window and free market creation (see `get_config`). The records on author pages such as `/u/NEARProtocol` and `/u/VitalikButerin` come from these test markets: they are not real track records of those accounts.

## Where NEAR is used

| What | NEAR piece | Code |
|---|---|---|
| The whole market lifecycle: locked rules (hash stored), creation and challenge bonds, CPMM positions, receipts, challenges, arbitration, payouts, refunds | Rust contract, `near-sdk` 5.30.1 | [`contracts/market`](contracts/market/src/lib.rs) |
| USDC in and out of markets in one transaction | NEP-141 `ft_transfer_call` / `ft_on_transfer`, storage registration | [`contracts/market`](contracts/market/src/lib.rs), [`packages/shared/src/lib/near/contract.ts`](packages/shared/src/lib/near/contract.ts) |
| Test USDC with a faucet and a simulated cross-chain deposit | NEP-141 token contract | [`contracts/mock-usdc`](contracts/mock-usdc/src/lib.rs) |
| Author records: right/wrong per post, counted once, on chain | Contract state, `get_record` | [`contracts/market`](contracts/market/src/lib.rs), [`apps/web/src/components/record`](apps/web/src/components/record/author-record.tsx) |
| Claim history kept after a payout | Raw storage records, `get_user_claims` | [`contracts/market`](contracts/market/src/lib.rs) |
| Finding predictions, drafting rules, reading the source at the deadline, the chat | **NEAR AI Cloud**: private inference in a TEE, per-answer ECDSA signatures | [`apps/web/src/lib/ai`](apps/web/src/lib/ai/near-ai.ts), [`apps/web/src/lib/resolve`](apps/web/src/lib/resolve/agent.ts) |
| Proof of what the AI read and answered, kept with the result | NEAR AI signature, model and chat id stored in the receipt; checked by `pnpm verify` | [`packages/shared/scripts/verify.mjs`](packages/shared/scripts/verify.mjs) |
| An admin's decision on a result | **NEP-413** signed message, checked against the account's full-access keys on chain | [`apps/web/src/lib/resolve/nep413.ts`](apps/web/src/lib/resolve/nep413.ts) |
| A server that can only post results | **Function-call access key** limited to `post_receipt` and `finalize` | [`apps/web/src/lib/resolve/operator.ts`](apps/web/src/lib/resolve/operator.ts), [`contracts/deploy-testnet.sh`](contracts/deploy-testnet.sh) |
| Sign-in and every transaction | NEAR wallets through `@hot-labs/near-connect`, RPC with `near-api-js` | [`packages/shared/src/lib/near`](packages/shared/src/lib/near) |
| New users can act at once | 0.25 testnet NEAR sent to new accounts for gas and storage | [`apps/web/src/app/api/onboard`](apps/web/src/app/api/onboard/route.ts) |

There is no database. Markets, positions and records are read from the contract over RPC; the Next.js server only reads X and NEAR AI, keeps the evidence files and runs the result agent.

## What is not on NEAR, or is simulated

- **Testnet only**, with a mock USDC. The contracts are not audited ([SECURITY.md](contracts/SECURITY.md)).
- **Deposits from other chains are simulated.** The Deposit dialog's other-chain tab and the withdrawal to another chain do not bridge anything. A server key limited to the mock token's `simulate_deposit` mints test USDC to the account. A mainnet version would use NEAR Intents.
- Posts come from X through twitterapi.io. Source pages are read through Jina Reader. Evidence bundles (snapshot, AI request and response) are kept on the web server's disk, and only their hashes and the AI signature are on chain.
- A person confirms every result. The contract cannot tell whether a result is true; the challenge window and the arbiter are the safeguard.

## Partners

| Partner | Used for |
|---|---|
| [NEAR AI Cloud](https://cloud.near.ai) | Private inference in a TEE with a signature on each answer: finding predictions in posts, drafting market rules, reading the source at the deadline, the Predit AI chat |
| [HOT Labs](https://hot-labs.org), HOT Connector (`@hot-labs/near-connect`) | Wallet sign-in and every transaction |
| [FastNEAR](https://fastnear.com) | RPC, with drpc and rpc.testnet.near.org as fallbacks |
| [NearBlocks](https://testnet.nearblocks.io) | Explorer links for accounts and transactions |

A mainnet version would take deposits from other chains through NEAR Intents.

## How a result is reached

```
deadline ─► agent snapshots the source in the rules (sha256)
         ─► NEAR AI reads snapshot + rules in a TEE ─► signed answer (YES / NO / invalid)
         ─► admin reviews at /admin/resolve, signs the decision (NEP-413)
         ─► operator key posts post_receipt: outcome, reason, hash, evidence link, AI signature
         ─► challenge window: anyone can bond a challenge, the arbiter rules
         ─► finalize: payouts, bonds returned, author record updated
```

## Failure cases

| What goes wrong | What happens |
|---|---|
| The operator key leaks | The key can only call `post_receipt` and `finalize`; it cannot move funds. A YES or NO receipt needs an evidence hash and a NEAR AI reading (the contract stores the signature; `pnpm verify` checks it), and only after the deadline. A wrong receipt can still be posted: anyone can challenge it with a bond during the window, and the arbiter rules |
| The operator goes silent | After `stuck_after_sec` (7 days) past the deadline, anyone can call `claim_stuck`: the market is cancelled and everyone gets their money back |
| The arbiter goes silent | 7 days after the challenge, anyone can call `claim_stuck` and the posted receipt stands, so a challenge alone cannot void a result |
| The source cannot be read | The agent keeps trying for 15 minutes after the deadline, then proposes Invalid (`source_unavailable`): the market refunds positions at cost |
| The source page tries prompt injection | NEAR AI is told the snapshot is untrusted data and to judge only by the rules. A person confirms every result, and anyone can challenge it |
| NEAR AI is down | No reading, so no YES or NO can be posted; the agent retries every 20 seconds and the market waits. If nothing is posted within 7 days, `claim_stuck` refunds |
| The creator declares the wrong author or side | `author_ref`, `post_id` and `claim_side` are declared by the creator; a challenge only disputes the result. Still open ([SECURITY.md](contracts/SECURITY.md), M2) |
| Nobody took the winning side | The market refunds, and it does not count in the author's record |

More in [`contracts/SECURITY.md`](contracts/SECURITY.md): the review results, the open issues and the steps before mainnet.

## Repository

| Path | What it is |
|---|---|
| [`contracts/`](contracts/README.md) | Rust workspace: `market` (the contract), `core` (market maths), `mock-usdc`, `sandbox-tests`, testnet scripts |
| `apps/web/` | Next.js app: feed, markets, create, portfolio, admin review, Predit AI, the result agent (`src/lib/resolve`) |
| `packages/shared/` | NEAR client, contract mappers, shared UI and the `verify` script |
| `evidence/` | Copies of evidence bundles, for `pnpm verify` |

## Tests

| Command | What it covers |
|---|---|
| `cd contracts && ./build.sh && cargo test` | Maths, contract unit tests, and the full lifecycle on a local NEAR node |
| `pnpm test` | Unit tests: mappers, evidence checks, drafts |
| `pnpm build && pnpm e2e` | Playwright on the built app against the testnet contract. An injected wallet records each transaction the app asks for and refuses it, so specs check the exact contract call |
| `pnpm e2e:testnet` | Signs real testnet transactions (keys from `~/.near-credentials`): a trade, the full result flow, a challenge overturned |

## Built during NEAR HACKATHON

The first commit, tagged `pre-hackathon`, holds code that existed before the hackathon: the app files this build reuses and the market maths in `contracts/core`. Everything after it, up to the `hackathon-submission` tag, was built during the hackathon: [compare on GitHub](https://github.com/PreditMarket/Predit-Near/compare/pre-hackathon...hackathon-submission), or `git diff pre-hackathon hackathon-submission`.

## Libraries

- Contracts: `near-sdk` and `near-contract-standards` 5.30.1, `cargo-near` 0.23, `near-workspaces` 0.24 (sandbox tests), `tokio`, `anyhow`, `serde_json`.
- Web: Next.js 15, React 18, `@hot-labs/near-connect`, `near-api-js`, `viem` (signature recovery), TanStack Query, Zustand, Tailwind CSS 4 with `@tailwindcss/typography` and `tw-animate-css`, Radix UI, vaul, sonner, lucide-react, `class-variance-authority`, `clsx`, `tailwind-merge`, `next-themes`, `boring-avatars`, `qrcode.react`, `isomorphic-dompurify`, serwist, Sentry.
- Tooling: TypeScript, ESLint (`eslint-config-next`), Playwright, Vitest, Husky, pnpm.
- Services: NEAR AI Cloud, twitterapi.io (posts from X), Jina Reader (source snapshots).

Much of the code was written with AI assistance (Claude Code).

## License

[MIT](LICENSE)
