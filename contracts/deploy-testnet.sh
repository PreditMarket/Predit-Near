#!/usr/bin/env bash
# Creates testnet accounts, deploys both contracts and limits the operator's key.
# Usage: ./build.sh && ./deploy-testnet.sh <account-prefix>
#   FUNDER=<account>  pay for new accounts from this one instead of the faucet,
#                     which rate-limits quickly. FUND_AMOUNT defaults to 1.5 NEAR.
# Keys are saved in ~/.near-credentials, never in this repository.
set -euo pipefail
cd "$(dirname "$0")"

PREFIX="${1:?usage: deploy-testnet.sh <account-prefix>}"
NET="network-config testnet"
SIGN="sign-with-legacy-keychain send"
MARKET="$PREFIX-market.testnet"
USDC="$PREFIX-usdc.testnet"
OWNER="$PREFIX-owner.testnet"
OPERATOR="$PREFIX-operator.testnet"
ARBITER="$PREFIX-arbiter.testnet"
TREASURY="$PREFIX-treasury.testnet"

for account in "$MARKET" "$USDC" "$OWNER" "$OPERATOR" "$ARBITER" "$TREASURY"; do
  if near account view-account-summary "$account" $NET now >/dev/null 2>&1; then
    echo "exists: $account"
  elif [ -n "${FUNDER:-}" ]; then
    near account create-account fund-myself "$account" "${FUND_AMOUNT:-1.5 NEAR}" \
      autogenerate-new-keypair save-to-legacy-keychain sign-as "$FUNDER" $NET $SIGN
  else
    near account create-account sponsor-by-faucet-service "$account" \
      autogenerate-new-keypair save-to-legacy-keychain $NET create
  fi
done

near contract deploy "$USDC" use-file target/near/predit_mock_usdc/predit_mock_usdc.wasm \
  with-init-call new json-args '{}' prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' $NET $SIGN

near contract deploy "$MARKET" use-file target/near/predit_market/predit_market.wasm \
  with-init-call new json-args \
  "{\"owner\":\"$OWNER\",\"operator\":\"$OPERATOR\",\"arbiter\":\"$ARBITER\",\"treasury\":\"$TREASURY\",\"collateral\":\"$USDC\"}" \
  prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' $NET $SIGN

# The market needs a USDC balance to receive bets, and the treasury to collect fees.
for account in "$MARKET" "$TREASURY"; do
  near contract call-function as-transaction "$USDC" storage_deposit \
    json-args "{\"account_id\":\"$account\"}" prepaid-gas '100.0 Tgas' attached-deposit '0.01 NEAR' \
    sign-as "$OWNER" $NET $SIGN
done

# The key the agent runs with: it can only post receipts and finalize.
near account add-key "$OPERATOR" grant-function-call-access \
  --allowance '1 NEAR' --contract-account-id "$MARKET" \
  --function-names 'post_receipt, finalize' \
  autogenerate-new-keypair save-to-legacy-keychain $NET $SIGN

echo "market: $MARKET  usdc: $USDC"
