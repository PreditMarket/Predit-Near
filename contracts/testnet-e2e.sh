#!/usr/bin/env bash
# Runs a full market lifecycle against a deployed testnet contract:
#   a market that finalizes, and a market whose receipt is challenged and
#   overturned.
# Takes about 3 minutes. Stops at the first check that fails.
#
# Usage: ./testnet-e2e.sh <account-prefix>
#   OPERATOR_KEY=<path>  key file of the operator's limited key
#                        (default: the first function-call key found)
#   FUNDER=<account>     pay for the two test bettors from this account
#                        instead of the faucet (2.5 NEAR each)
set -uo pipefail

P="${1:?usage: testnet-e2e.sh <account-prefix>}"
MARKET="$P-market.testnet"; USDC="$P-usdc.testnet"; OWNER="$P-owner.testnet"
OPERATOR="$P-operator.testnet"; ARBITER="$P-arbiter.testnet"; TREASURY="$P-treasury.testnet"
ALICE="$P-alice.testnet"; BOB="$P-bob.testnet"
NET="network-config testnet"; SIGN="sign-with-legacy-keychain send"
WINDOW=60; TS=$(date +%s); AUTHOR="x:e2e-$TS"

die() { echo "FAIL: $*"; exit 1; }
ok() { echo "  ok: $*"; }

# name, then the near arguments ending in the signing method.
run() { near contract call-function as-transaction "$@" 2>&1; }
tx() {
  local contract="$1" method="$2" args="$3" gas="$4" deposit="$5" signer="$6"
  LAST=$(run "$contract" "$method" json-args "$args" prepaid-gas "$gas" attached-deposit "$deposit" sign-as "$signer" $NET $SIGN)
  echo "$LAST" | grep -q 'succeeded' || { echo "$LAST" | tail -20; die "$method by $signer"; }
}
tx_fails() {
  local contract="$1" method="$2" args="$3" gas="$4" deposit="$5" signer="$6"
  LAST=$(run "$contract" "$method" json-args "$args" prepaid-gas "$gas" attached-deposit "$deposit" sign-as "$signer" $NET $SIGN)
  ! echo "$LAST" | grep -q 'succeeded' || die "$method by $signer should have failed"
}
op() {
  local method="$1" args="$2"
  LAST=$(run "$MARKET" "$method" json-args "$args" prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' sign-as "$OPERATOR" $NET sign-with-access-key-file "$OPERATOR_KEY" send)
  echo "$LAST" | grep -q 'succeeded' || { echo "$LAST" | tail -20; die "operator key $method"; }
}
view() { near contract call-function as-read-only "$1" "$2" json-args "$3" $NET now 2>/dev/null; }
usdc_of() { view "$USDC" ft_balance_of "{\"account_id\":\"$1\"}" | tr -d '"\n '; }
field() { python3 -I -c "import json,sys; d=json.load(sys.stdin)
for k in sys.argv[1].split('.'): d=d[k]
print(d if not isinstance(d,dict) else json.dumps(d))" "$1"; }
market_id() { echo "$LAST" | grep -E '^"[0-9]+"$' | tail -1 | tr -d '"'; }
wait_until() { local n=$(( $1 - $(date +%s) )); [ "$n" -gt 0 ] && sleep "$n"; true; }
check() { [ "$2" = "$3" ] && ok "$1 = $3" || die "$1: expected $3, got $2"; }

if [ -z "${OPERATOR_KEY:-}" ]; then
  id=$(near account list-keys "$OPERATOR" $NET now 2>&1 | grep 'only do' | grep -oE 'ed25519:[A-Za-z0-9]+' | head -1)
  OPERATOR_KEY="$HOME/.near-credentials/testnet/$OPERATOR/${id/:/_}.json"
fi
[ -f "$OPERATOR_KEY" ] || die "no operator key file"

echo "== accounts and funds"
for a in "$ALICE" "$BOB"; do
  if ! near account view-account-summary "$a" $NET now >/dev/null 2>&1; then
    if [ -n "${FUNDER:-}" ]; then
      near account create-account fund-myself "$a" '2.5 NEAR' autogenerate-new-keypair save-to-legacy-keychain sign-as "$FUNDER" $NET $SIGN >/dev/null 2>&1 || die "create $a"
    else
      near account create-account sponsor-by-faucet-service "$a" autogenerate-new-keypair save-to-legacy-keychain $NET create >/dev/null 2>&1 || die "create $a"
    fi
  fi
  run "$USDC" faucet json-args '{}' prepaid-gas '50.0 Tgas' attached-deposit '0 NEAR' sign-as "$a" $NET $SIGN >/dev/null
done
A0=$(usdc_of "$ALICE"); B0=$(usdc_of "$BOB")
[ "$A0" -ge 30000000 ] && [ "$B0" -ge 30000000 ] || die "not enough tUSDC"
ok "alice $A0, bob $B0"

EXP=$(( $(date +%s) + 75 ))
args() { python3 -I - "$@" <<'PY'
import json, sys
post, expiry, author, kind, window = sys.argv[1:6]
labels = ("Yes", "No", "Crypto") if kind == "crypto" else ("Lakers", "Celtics", "Sports")
print(json.dumps({
    "post": {"source": "x", "post_id": post, "author_ref": author, "text": "testnet e2e"},
    "claim_side": "yes",
    "rules": {"question": f"e2e {kind} {post}", "description": "testnet e2e", "yes_label": labels[0], "no_label": labels[1],
              "yes_condition": "YES condition", "no_condition": "NO condition", "resolution_source": "https://example.com/source",
              "invalid_conditions": "none", "category": labels[2], "image_url": "", "expiry_sec": expiry},
    "draft": {"model": "e2e", "chat_id": "e2e"},
    "challenge_window_sec": int(window)}))
PY
}
buy() { # who id side amount
  local a; a=$(python3 -I -c "import json,sys; print(json.dumps({'receiver_id':sys.argv[1],'amount':sys.argv[2],'msg':json.dumps({'action':'buy','market_id':sys.argv[3],'side':sys.argv[4],'min_shares':'0'})}))" "$MARKET" "$4" "$2" "$3")
  tx "$USDC" ft_transfer_call "$a" '150.0 Tgas' '1 yoctoNEAR' "$1"
}

echo "== create"
tx "$MARKET" create_market "$(args "e2e-p-$TS" "$EXP" "$AUTHOR" crypto "$WINDOW")" '100.0 Tgas' '2 NEAR' "$OWNER"; PRICE_ID=$(market_id)
tx "$MARKET" create_market "$(args "e2e-e-$TS" "$EXP" "$AUTHOR" event "$WINDOW")" '100.0 Tgas' '2 NEAR' "$OWNER"; EVENT_ID=$(market_id)
[ -n "$PRICE_ID" ] && [ -n "$EVENT_ID" ] || die "no market id"
ok "price market $PRICE_ID, event market $EVENT_ID"

echo "== bets"
buy "$ALICE" "$PRICE_ID" yes 20000000; buy "$BOB" "$PRICE_ID" no 10000000
buy "$ALICE" "$EVENT_ID" yes 10000000; buy "$BOB" "$EVENT_ID" no 20000000
check "price market trades" "$(view "$MARKET" get_market "{\"market_id\":\"$PRICE_ID\"}" | field trades)" 2
check "event market yes label" "$(view "$MARKET" get_market "{\"market_id\":\"$EVENT_ID\"}" | field rules.yes_label)" Lakers

echo "== the operator key is limited"
LAST=$(run "$MARKET" arbitrate json-args "{\"market_id\":\"$EVENT_ID\",\"decision\":\"uphold\"}" prepaid-gas '50.0 Tgas' attached-deposit '0 NEAR' sign-as "$OPERATOR" $NET sign-with-access-key-file "$OPERATOR_KEY" send)
! echo "$LAST" | grep -q 'succeeded' || die "limited key called arbitrate"; ok "cannot call arbitrate"
LAST=$(near tokens "$OPERATOR" send-near "$BOB" '0.1 NEAR' $NET sign-with-access-key-file "$OPERATOR_KEY" send 2>&1)
echo "$LAST" | grep -qi 'error\|fail\|NotEnough\|Invalid\|deny\|denied' || die "limited key moved NEAR"; ok "cannot transfer NEAR"

echo "== wait for expiry"
tx_fails "$MARKET" finalize "{\"market_id\":\"$PRICE_ID\"}" '50.0 Tgas' '0 NEAR' "$BOB"
wait_until $(( EXP + 3 ))

echo "== receipts"
op post_receipt "{\"market_id\":\"$PRICE_ID\",\"report\":{\"proposed\":{\"outcome\":\"yes\",\"reason\":\"e2e proposal\"}},\"evidence\":{\"hash\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\"uri\":\"https://example.com/source\",\"ai\":{\"model\":\"e2e\",\"chat_id\":\"e2e\",\"signed_text\":\"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd\",\"signature\":\"0xababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababab\",\"signing_address\":\"0xb98a789cdc4817275f5155593ba73ef2a957e779\"}}}"
op post_receipt "{\"market_id\":\"$EVENT_ID\",\"report\":{\"proposed\":{\"outcome\":\"yes\",\"reason\":\"e2e proposal\"}},\"evidence\":{\"hash\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\"uri\":\"https://example.com/source\",\"ai\":{\"model\":\"glm\",\"chat_id\":\"c1\",\"signed_text\":\"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd\",\"signature\":\"0xababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababab\",\"signing_address\":\"0xb98a789cdc4817275f5155593ba73ef2a957e779\"}}}"
RECEIPT_AT=$(date +%s)
check "receipt outcome" "$(view "$MARKET" get_market "{\"market_id\":\"$PRICE_ID\"}" | field receipt.outcome)" yes

echo "== challenge and overturn the event market"
tx "$MARKET" challenge "{\"market_id\":\"$EVENT_ID\",\"reason_uri\":\"https://example.com/why\"}" '50.0 Tgas' '1 NEAR' "$BOB"
tx_fails "$MARKET" finalize "{\"market_id\":\"$EVENT_ID\"}" '50.0 Tgas' '0 NEAR' "$ALICE"
tx "$MARKET" arbitrate "{\"market_id\":\"$EVENT_ID\",\"decision\":{\"overturn\":\"no\"}}" '100.0 Tgas' '0 NEAR' "$ARBITER"
check "event outcome" "$(view "$MARKET" get_market "{\"market_id\":\"$EVENT_ID\"}" | field outcome)" no

echo "== finalize after the window"
wait_until $(( RECEIPT_AT + WINDOW + 5 ))
op finalize "{\"market_id\":\"$PRICE_ID\"}"
check "price status" "$(view "$MARKET" get_market "{\"market_id\":\"$PRICE_ID\"}" | field status)" finalized

echo "== payouts"
tx "$MARKET" redeem "{\"market_id\":\"$PRICE_ID\"}" '150.0 Tgas' '1 yoctoNEAR' "$ALICE"
tx "$MARKET" redeem "{\"market_id\":\"$EVENT_ID\"}" '150.0 Tgas' '1 yoctoNEAR' "$BOB"
tx_fails "$MARKET" redeem "{\"market_id\":\"$PRICE_ID\"}" '150.0 Tgas' '1 yoctoNEAR' "$BOB"
tx_fails "$MARKET" redeem "{\"market_id\":\"$EVENT_ID\"}" '150.0 Tgas' '1 yoctoNEAR' "$ALICE"
# Stakes in: 30 tUSDC each. Pot net of 0.3% is 29.91, less 1% redeem fee.
check "alice tUSDC" "$(usdc_of "$ALICE")" $(( A0 - 30000000 + 29610900 ))
check "bob tUSDC" "$(usdc_of "$BOB")" $(( B0 - 30000000 + 29610900 ))

echo "== record"
RECORD=$(view "$MARKET" get_record "{\"author_ref\":\"$AUTHOR\"}")
check "correct" "$(echo "$RECORD" | field correct)" 1
check "wrong" "$(echo "$RECORD" | field wrong)" 1

echo "== fees and solvency"
tx "$MARKET" withdraw '{}' '150.0 Tgas' '1 yoctoNEAR' "$TREASURY"
tx "$MARKET" withdraw '{}' '150.0 Tgas' '1 yoctoNEAR' "$OWNER"
check "treasury fees collected" "$(view "$MARKET" get_claimable "{\"account_id\":\"$TREASURY\"}" | tr -d '"\n ')" 0
ACC=$(view "$MARKET" get_accounting '{}')
OWED=$(echo "$ACC" | python3 -I -c 'import json,sys; d=json.load(sys.stdin); print(sum(int(d[k]) for k in ("total_pool_collateral","total_claimable","in_flight")))')
HELD=$(usdc_of "$MARKET")
echo "  owed $OWED, held $HELD"
[ "$HELD" -ge "$OWED" ] || die "contract is short"
[ "$(echo "$ACC" | field in_flight)" = "0" ] || die "a payout never settled"
echo "PASS: full lifecycle on testnet ($MARKET, markets $PRICE_ID and $EVENT_ID)"
