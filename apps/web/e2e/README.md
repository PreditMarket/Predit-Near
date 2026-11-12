# End-to-end tests (NEAR build)

Playwright drives the built app in Chromium against the NEAR testnet contract.

```bash
pnpm --filter web build
pnpm --filter web test:e2e            # no keys, nothing signed
pnpm --filter web test:e2e:testnet    # also signs real testnet transactions
```

**Default suite.** Reads the deployed contract (`predit-markets-market.testnet`) and signs nothing. The feed and the NEAR AI routes are stubbed in the browser, so no X or NEAR AI key is needed. A test wallet is injected the way any NEAR wallet reaches near-connect; it records each transaction the app asks for and refuses it, so a test checks the exact contract call (method, arguments, deposit) without spending anything.

**Testnet suite** (`e2e/testnet/`). The same wallet signs for real, with full-access keys read from `~/.near-credentials/testnet` (or `NEAR_CREDENTIALS_DIR`). Keys never live in this repository.

- `trade.spec.ts`: a 1 tUSDC position and its sale land on the contract.
- `resolve.spec.ts`: the result flow. NEAR AI reads the source, an admin signs the decision with their wallet (NEP-413), the operator posts the receipt, `pnpm verify` passes, the agent finalizes it and the author's record counts it. A second market is challenged from its page and overturned by the arbiter. It needs a server whose agent runs, so start one with `NEAR_OPERATOR_ACCOUNT`, `NEAR_OPERATOR_KEY`, `NEAR_AI_API_KEY` and `NEAR_ADMIN_ACCOUNTS` (including `NEAR_E2E_ADMIN`), then run with `E2E_BASE_URL=http://localhost:3000`. It skips itself otherwise.

Accounts default to the demo ones (`predit-markets-{alice,bob,owner,arbiter}.testnet`) and can be changed with `NEAR_E2E_TRADER`, `NEAR_E2E_CREATOR`, `NEAR_E2E_CHALLENGER`, `NEAR_E2E_ADMIN` and `NEAR_E2E_ARBITER`.
