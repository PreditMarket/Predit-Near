#!/usr/bin/env python3
"""Full case test on NEAR testnet, with mock USDC.

Every success path and every rejection the contract promises, against a fresh
deployment with short timers. A rejection only passes if it fails for the
stated reason.

Usage: FUNDERS=a.testnet,b.testnet,c.testnet python3 -I testnet-fullcase.py <prefix>
Build first with ./build.sh. Takes about 30 minutes and needs about 22 NEAR on
the first run (accounts are reused). Exits non-zero if any check failed.
"""

import base64
import json
import math
import os
import re
import subprocess
import sys
import time
import urllib.request

PREFIX = sys.argv[1]
FUNDERS = os.environ["FUNDERS"].split(",")
RPCS = ["https://test.rpc.fastnear.com", "https://rpc.testnet.near.org"]

USDC_UNIT = 1_000_000
NEAR_UNIT = 10**24
BOND = NEAR_UNIT // 10
STUCK_AFTER = 180
WINDOW = 60
FREEZE = 5
ONE_YOCTO = "1 yoctoNEAR"
NET = ["network-config", "testnet"]


def acct(role):
    return f"{PREFIX}-{role}.testnet"


MARKET, USDC, FAKE = acct("market"), acct("usdc"), acct("fake")
OWNER, OPERATOR, ARBITER, TREASURY = acct("owner"), acct("operator"), acct("arbiter"), acct("treasury")
ALICE, BOB, CAROL = acct("alice"), acct("bob"), acct("carol")

passed, failed = 0, []
OPERATOR_KEY = None


def log(message):
    print(message, flush=True)


def check(name, condition, detail=""):
    global passed
    if condition:
        passed += 1
        log(f"  ok   {name}")
    else:
        failed.append(name)
        log(f"  FAIL {name} {detail}")
    return condition


def section(title):
    log(f"\n== [{time.strftime('%H:%M:%S')}] {title}")


def near(*args):
    """Runs the CLI. Rate limits that hit before signing are retried, which
    cannot send a transaction twice."""
    for attempt in range(8):
        r = subprocess.run(["near", *args], capture_output=True, text=True, timeout=240)
        out = r.stdout + r.stderr
        limited = "rate limit" in out or "429" in out or "Too Many Requests" in out
        if limited and "signed successfully" not in out:
            time.sleep(5 * (attempt + 1))
            continue
        time.sleep(1)
        return out
    return out


def rpc(method, params):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    for attempt in range(8):
        try:
            url = RPCS[attempt % len(RPCS)]
            req = urllib.request.Request(url, data=body, headers={"content-type": "application/json"})
            result = json.load(urllib.request.urlopen(req, timeout=20))
            if "result" in result and "error" not in result["result"]:
                return result["result"]
        except Exception:
            pass
        time.sleep(2)
    raise RuntimeError(f"rpc failed: {method}")


def view(contract, method, args=None):
    result = rpc("query", {
        "request_type": "call_function", "finality": "final", "account_id": contract, "method_name": method,
        "args_base64": base64.b64encode(json.dumps(args or {}).encode()).decode(),
    })
    return json.loads(bytes(result["result"]).decode())


def near_balance(account):
    return int(rpc("query", {"request_type": "view_account", "finality": "final", "account_id": account})["amount"])


def tx(contract, method, args, signer, deposit="0 NEAR", gas="100.0 Tgas", key_file=None):
    sign = ["sign-with-access-key-file", key_file, "send"] if key_file else ["sign-with-legacy-keychain", "send"]
    return near("contract", "call-function", "as-transaction", contract, method, "json-args", json.dumps(args),
                "prepaid-gas", gas, "attached-deposit", deposit, "sign-as", signer, *NET, *sign)


def must(name, contract, method, args, signer, **kw):
    out = tx(contract, method, args, signer, **kw)
    check(name, "succeeded" in out, out[-500:])
    return out


def reject(name, expected, contract, method, args, signer, **kw):
    """The call must fail, and for the stated reason."""
    out = tx(contract, method, args, signer, **kw)
    check(name, "succeeded" not in out and (expected is None or expected in out), out[-400:])


def op(name, method, args):
    return must(name, MARKET, method, args, OPERATOR, key_file=OPERATOR_KEY)


def op_reject(name, expected, method, args):
    reject(name, expected, MARKET, method, args, OPERATOR, key_file=OPERATOR_KEY)


def usdc(account):
    return int(view(USDC, "ft_balance_of", {"account_id": account}))


def market(i):
    return view(MARKET, "get_market", {"market_id": str(i)})


def position(i, who):
    return view(MARKET, "get_position", {"market_id": str(i), "account_id": who})


def claimable(who):
    return int(view(MARKET, "get_claimable", {"account_id": who}))


def wait_until(ts):
    delay = ts - time.time()
    if delay > 0:
        time.sleep(delay)


def fee_in(amount):
    return math.ceil(amount * 30 / 10_000)


def net_in(amount):
    return amount - fee_in(amount)


def redeem_net(gross):
    return gross - math.ceil(gross * 100 / 10_000)


# ---- deployment --------------------------------------------------------------

def setup():
    global OPERATOR_KEY
    section("deploy a fresh contract with short timers")
    plan = [(MARKET, "6.5", 0), (USDC, "2.5", 0), (FAKE, "2.5", 1), (OWNER, "4.5", 1), (CAROL, "1", 1),
            (OPERATOR, "1", 2), (ARBITER, "0.5", 2), (TREASURY, "0.5", 2), (ALICE, "1", 2), (BOB, "1", 2)]
    for account, amount, funder in plan:
        if rpc_exists(account):
            log(f"  exists {account}")
            continue
        out = near("account", "create-account", "fund-myself", account, f"{amount} NEAR", "autogenerate-new-keypair",
                   "save-to-legacy-keychain", "sign-as", FUNDERS[funder], *NET, "sign-with-legacy-keychain", "send")
        if not rpc_exists(account):
            sys.exit(f"could not create {account}: {out[-400:]}")

    config = {
        "creation_bond": str(BOND), "challenge_bond": str(BOND),
        "default_challenge_window_sec": WINDOW, "min_challenge_window_sec": 20, "max_challenge_window_sec": 3600,
        "stuck_after_sec": STUCK_AFTER, "min_buy": str(USDC_UNIT),
        "max_markets_per_post": 5, "trade_fee_bps": 30, "redeem_fee_bps": 100, "creator_share_bps": 1000,
        "trade_freeze_sec": FREEZE, "virtual_liquidity_l": "500000000",
    }
    usdc_wasm = "target/near/predit_mock_usdc/predit_mock_usdc.wasm"
    for token in (USDC, FAKE):
        if not code_deployed(token):
            near("contract", "deploy", token, "use-file", usdc_wasm, "with-init-call", "new", "json-args", "{}",
                 "prepaid-gas", "100.0 Tgas", "attached-deposit", "0 NEAR", *NET, "sign-with-legacy-keychain", "send")
    if not code_deployed(MARKET):
        init = {"owner": OWNER, "operator": OPERATOR, "arbiter": ARBITER, "treasury": TREASURY,
                "collateral": USDC, "config": config}
        near("contract", "deploy", MARKET, "use-file", "target/near/predit_market/predit_market.wasm",
             "with-init-call", "new", "json-args", json.dumps(init), "prepaid-gas", "100.0 Tgas",
             "attached-deposit", "0 NEAR", *NET, "sign-with-legacy-keychain", "send")
    check("contract deployed and initialized", view(MARKET, "get_config")["stuck_after_sec"] == STUCK_AFTER)

    must("market registered on USDC", USDC, "storage_deposit", {"account_id": MARKET}, OWNER, deposit="0.01 NEAR")
    must("market registered on the fake token", FAKE, "storage_deposit", {"account_id": MARKET}, OWNER, deposit="0.01 NEAR")
    for who in (OWNER, TREASURY, ALICE, BOB, CAROL):
        # Also tops up accounts an earlier run left short (the faucet has a cooldown).
        if view(USDC, "storage_balance_of", {"account_id": who}) is None or usdc(who) < 50 * USDC_UNIT:
            must(f"faucet {who.split('-')[-1]}", USDC, "faucet", {}, who, gas="50.0 Tgas")
    if view(FAKE, "storage_balance_of", {"account_id": ALICE}) is None:
        must("faucet on the fake token", FAKE, "faucet", {}, ALICE, gas="50.0 Tgas")

    keys = near("account", "list-keys", OPERATOR, *NET, "now")
    if "only do" not in keys:
        near("account", "add-key", OPERATOR, "grant-function-call-access", "--allowance", "1 NEAR",
             "--contract-account-id", MARKET, "--function-names", "post_receipt, finalize",
             "autogenerate-new-keypair", "save-to-legacy-keychain", *NET, "sign-with-legacy-keychain", "send")
        keys = near("account", "list-keys", OPERATOR, *NET, "now")
    line = next(l for l in keys.splitlines() if "only do" in l)
    key_id = re.search(r"ed25519:[A-Za-z0-9]+", line).group(0).replace(":", "_")
    OPERATOR_KEY = os.path.expanduser(f"~/.near-credentials/testnet/{OPERATOR}/{key_id}.json")
    check("operator key is limited to post_receipt and finalize", "post_receipt" in line and "finalize" in line)


def rpc_exists(account):
    try:
        body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "query", "params": {
            "request_type": "view_account", "finality": "final", "account_id": account}}).encode()
        req = urllib.request.Request(RPCS[0], data=body, headers={"content-type": "application/json"})
        return "result" in json.load(urllib.request.urlopen(req, timeout=20))
    except Exception:
        return False


def code_deployed(account):
    r = rpc("query", {"request_type": "view_account", "finality": "final", "account_id": account})
    return r["code_hash"] != "11111111111111111111111111111111"


def cleanup():
    """Closes anything an earlier run left open, returning its bonds and stakes."""
    section("clean up earlier runs")
    seen, start = [], 0
    while True:
        page = view(MARKET, "get_markets", {"from": str(start), "limit": 100})
        if not page:
            break
        seen += page
        start += len(page)
    for m in seen:
        if m["status"] == "open":
            must(f"close old market {m['id']}", MARKET, "cancel_market", {"market_id": m["id"]}, OWNER)
    for who in (ALICE, BOB, CAROL):
        for m, p in view(MARKET, "get_user_markets", {"account_id": who, "limit": 100}):
            if int(p["yes_cost"]) + int(p["no_cost"]) > 0 and market(m["id"])["status"] == "cancelled":
                must(f"refund old position {m['id']}", MARKET, "refund", {"market_id": m["id"]}, who,
                     deposit=ONE_YOCTO, gas="150.0 Tgas")
    a = view(MARKET, "get_accounting")
    check("nothing left over from earlier runs", a["total_pool_collateral"] == "0", str(a))


# ---- market helpers ----------------------------------------------------------

def rules(kind, expiry, labels=("Yes", "No")):
    return {"question": f"Full case {kind} market", "description": "Testnet full case", "yes_label": labels[0],
            "no_label": labels[1], "yes_condition": "YES condition", "no_condition": "NO condition",
            "resolution_source": "https://example.com/source", "invalid_conditions": "None", "category": "Test",
            "image_url": "", "expiry_sec": str(expiry)}


def create_args(post_id, author, r, claim="yes", window=WINDOW):
    return {"post": {"source": "x", "post_id": post_id, "author_ref": author, "text": "full case"},
            "claim_side": claim, "rules": r, "draft": {"model": "fullcase", "chat_id": "fullcase"},
            "challenge_window_sec": window}


def create(name, post_id, author, r, claim="yes", window=WINDOW):
    out = must(f"create {name}", MARKET, "create_market", create_args(post_id, author, r, claim, window), OWNER,
               deposit="0.3 NEAR")
    found = re.findall(r'^"(\d+)"$', out, re.M)
    if not found:
        sys.exit(f"no market id for {name}: {out[-300:]}")
    return int(found[-1])


def buy_args(i, side, amount, min_shares="0"):
    return {"receiver_id": MARKET, "amount": str(amount),
            "msg": json.dumps({"action": "buy", "market_id": str(i), "side": side, "min_shares": min_shares})}


def buy(who, i, side, amount, token=None, min_shares="0"):
    return tx(token or USDC, "ft_transfer_call", buy_args(i, side, amount, min_shares), who, deposit=ONE_YOCTO, gas="150.0 Tgas")


def bet(name, who, i, side, amount):
    before = usdc(who)
    out = buy(who, i, side, amount)
    check(f"bet {name}", "succeeded" in out and usdc(who) == before - amount, out[-300:])


def bet_refused(name, who, i, side, amount, **kw):
    """A bet the contract refuses: no trade recorded, and the money comes back."""
    before, trades = usdc(who), market(i)["trades"]
    buy(who, i, side, amount, **kw)
    check(name, usdc(who) == before and market(i)["trades"] == trades,
          f"balance {before}->{usdc(who)} trades {trades}->{market(i)['trades']}")


def pay(name, method, i, who, expected=None):
    before = usdc(who)
    args = {"market_id": str(i)} if i is not None else {}
    out = tx(MARKET, method, args, who, deposit=ONE_YOCTO, gas="150.0 Tgas")
    ok = "succeeded" in out
    if expected is not None:
        ok = ok and usdc(who) - before == expected
    check(name, ok, f"delta {usdc(who) - before}, expected {expected}: {out[-200:]}")


def pay_rejected(name, reason, method, i, who):
    reject(name, reason, MARKET, method, {"market_id": str(i)}, who, deposit=ONE_YOCTO, gas="150.0 Tgas")


def status_is(name, i, expected, outcome="unset"):
    m = market(i)
    ok = m["status"] == expected and (outcome == "unset" or m["outcome"] == outcome)
    check(name, ok, f"status {m['status']} outcome {m['outcome']}")


SNAPSHOT_HASH = "a" * 64
AI_READING = {"model": "fullcase-model", "chat_id": "chat-1", "signed_text": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
              "signature": "0xababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababab", "signing_address": "0xb98a789cdc4817275f5155593ba73ef2a957e779"}


def evidence():
    return {"hash": SNAPSHOT_HASH, "uri": "https://example.com/source", "ai": AI_READING}


def manual(i, side):
    return {"market_id": str(i), "report": {"proposed": {"outcome": side, "reason": "Result from the listed source"}},
            "evidence": evidence()}


# ---- the run -----------------------------------------------------------------

setup()
cleanup()

RUN = str(int(time.time()))
A = f"x:fc-{RUN}"
FAR = int(time.time()) + 6 * 3600
M = {}

section("create: rejected inputs")
bad = rules("event", FAR)
reject("same labels on both sides", "Two different outcome labels", MARKET, "create_market",
       create_args(f"bad-{RUN}", "x:bad", {**bad, "yes_label": "Same", "no_label": "Same"}), OWNER, deposit="0.3 NEAR")
reject("image must be https", "Image must be an https URL", MARKET, "create_market",
       create_args(f"bad-{RUN}", "x:bad", {**bad, "image_url": "http://x"}), OWNER, deposit="0.3 NEAR")
reject("blank conditions", "Conditions cannot be blank", MARKET, "create_market",
       create_args(f"bad-{RUN}", "x:bad", {**bad, "yes_condition": "  "}), OWNER, deposit="0.3 NEAR")
reject("source must be https", "must be an https URL", MARKET, "create_market",
       create_args(f"bad-{RUN}", "x:bad", {**bad, "resolution_source": "ftp://x"}), OWNER, deposit="0.3 NEAR")
reject("resolution source required", "A resolution source is required", MARKET, "create_market",
       create_args(f"bad-{RUN}", "x:bad", {**bad, "resolution_source": ""}), OWNER, deposit="0.3 NEAR")
reject("oversized question", "Text is too long", MARKET, "create_market",
       create_args(f"bad-{RUN}", "x:bad", {**bad, "question": "x" * 201}), OWNER, deposit="0.3 NEAR")
reject("expiry too soon", "Expiry is too soon", MARKET, "create_market",
       create_args(f"bad-{RUN}", "x:bad", rules("event", int(time.time()) + 1)), OWNER, deposit="0.3 NEAR")
reject("expiry too far", "Expiry is too far out", MARKET, "create_market",
       create_args(f"bad-{RUN}", "x:bad", rules("event", int(time.time()) + 11 * 365 * 86400)), OWNER, deposit="0.3 NEAR")
reject("challenge window too short", "Challenge window out of range", MARKET, "create_market",
       create_args(f"bad-{RUN}", "x:bad", bad, window=5), OWNER, deposit="0.3 NEAR")
reject("bond not attached", "Attach at least", MARKET, "create_market",
       create_args(f"bad-{RUN}", "x:bad", bad), OWNER, deposit="0.01 NEAR")

section("markets for the checks that do not depend on expiry")
M["far"] = create("price market, distant expiry", f"far-{RUN}", f"{A}-far", rules("crypto", FAR))
M["sell"] = create("market for sells", f"sell-{RUN}", f"{A}-sell", rules("event", FAR))
M["failed_payout"] = create("failed payout", f"fp-{RUN}", f"{A}-fp", rules("event", FAR))
M["cancel_creator"] = create("creator cancels before trades", f"cc-{RUN}", f"{A}-cc", rules("event", FAR))
M["cancel_owner"] = create("owner cancels after trades", f"co-{RUN}", f"{A}-co", rules("event", FAR))
M["reserve"] = create("NEAR reserve check", f"rs-{RUN}", f"{A}-rs", rules("event", FAR, labels=("Lakers", "Celtics")))
check("rules hash is stored", len(market(M["far"])["rules_hash"]) == 64)
check("custom labels are stored", market(M["reserve"])["rules"]["yes_label"] == "Lakers")

section("five markets per post, cancelling frees a slot")
cap = [create(f"post cap {n}", f"cap-{RUN}", f"{A}-cap", rules("event", FAR)) for n in range(1, 6)]
check("found by post", len(view(MARKET, "get_markets_for_posts", {"post_ids": [f"cap-{RUN}"]})[0][1]) == 5)
reject("a sixth market on a post", "Too many markets on this post", MARKET, "create_market",
       create_args(f"cap-{RUN}", f"{A}-cap", rules("event", FAR)), OWNER, deposit="0.3 NEAR")
must("creator cancels one", MARKET, "cancel_market", {"market_id": str(cap[0])}, OWNER)
cap[0] = create("slot is free again", f"cap-{RUN}", f"{A}-cap", rules("event", FAR))
for n, i in enumerate(cap):
    must(f"clean up cap market {n}", MARKET, "cancel_market", {"market_id": str(i)}, OWNER)

section("buy: rejections, money comes back")
m = M["far"]
bet_refused("below the minimum buy", ALICE, m, "yes", USDC_UNIT - 1)
bet_refused("slippage limit", ALICE, m, "yes", 2 * USDC_UNIT, min_shares=str(2**63))
before_fake = int(view(FAKE, "ft_balance_of", {"account_id": ALICE}))
trades = market(m)["trades"]
buy(ALICE, m, "yes", 5 * USDC_UNIT, token=FAKE)
time.sleep(3)
check("fake token cannot buy", market(m)["trades"] == trades)
check("fake token is refunded", int(view(FAKE, "ft_balance_of", {"account_id": ALICE})) == before_fake)
before = usdc(ALICE)
tx(USDC, "ft_transfer_call", {"receiver_id": MARKET, "amount": str(USDC_UNIT), "msg": "not json"}, ALICE, deposit=ONE_YOCTO, gas="150.0 Tgas")
time.sleep(3)
check("malformed message is refunded", usdc(ALICE) == before)

section("bets and fees")
claim_before = claimable(OWNER), claimable(TREASURY)
bet("alice 20", ALICE, m, "yes", 20 * USDC_UNIT)
bet("bob 10", BOB, m, "no", 10 * USDC_UNIT)
check("price moved up", market(m)["price_yes_bps"] > 5000)
owner_gain, treasury_gain = claimable(OWNER) - claim_before[0], claimable(TREASURY) - claim_before[1]
fees_expected = fee_in(20 * USDC_UNIT) + fee_in(10 * USDC_UNIT)
check("fee is split into claimable", owner_gain + treasury_gain == fees_expected, f"{owner_gain}+{treasury_gain}")
check("creator gets 10% of the fee", owner_gain == fee_in(20 * USDC_UNIT) // 10 + fee_in(10 * USDC_UNIT) // 10, str(owner_gain))
check("listed for the user", any(pair[0]["id"] == str(m) for pair in view(MARKET, "get_user_markets", {"account_id": ALICE, "limit": 100})))

section("sell")
m = M["sell"]
bet("sell market, alice", ALICE, m, "yes", 10 * USDC_UNIT)
bet("sell market, bob", BOB, m, "no", 4 * USDC_UNIT)
p = position(m, ALICE)
shares, cost = int(p["yes_shares"]), int(p["yes_cost"])
reject("sell needs 1 yocto", "Requires attached deposit of exactly 1 yoctoNEAR", MARKET, "sell",
       {"market_id": str(m), "side": "yes", "shares": str(shares), "min_out": "0"}, ALICE, gas="150.0 Tgas")
reject("sell more than held", "InsufficientShares", MARKET, "sell",
       {"market_id": str(m), "side": "yes", "shares": str(shares + 1), "min_out": "0"}, ALICE, deposit=ONE_YOCTO, gas="150.0 Tgas")
reject("sell slippage limit", "Slippage", MARKET, "sell",
       {"market_id": str(m), "side": "yes", "shares": str(shares), "min_out": str(2**63)}, ALICE, deposit=ONE_YOCTO, gas="150.0 Tgas")
half = shares // 2
gross = cost * half // shares
expected = gross - math.ceil(gross * 30 / 10_000)
before = usdc(ALICE)
must("partial sell", MARKET, "sell", {"market_id": str(m), "side": "yes", "shares": str(half), "min_out": "0"}, ALICE, deposit=ONE_YOCTO, gas="150.0 Tgas")
time.sleep(3)
check("partial sell pays cost less fee", usdc(ALICE) - before == expected, f"{usdc(ALICE) - before} vs {expected}")
check("remaining shares", int(position(m, ALICE)["yes_shares"]) == shares - half)

section("failed payout becomes claimable, then withdrawable")
m = M["failed_payout"]
bet("carol bets", CAROL, m, "yes", 5 * USDC_UNIT)
bet("alice bets against", ALICE, m, "no", 2 * USDC_UNIT)
p = position(m, CAROL)
must("carol leaves the token", USDC, "storage_unregister", {"force": True}, CAROL, deposit=ONE_YOCTO)
tx(MARKET, "sell", {"market_id": str(m), "side": "yes", "shares": p["yes_shares"], "min_out": "0"}, CAROL, deposit=ONE_YOCTO, gas="150.0 Tgas")
time.sleep(3)
owed = claimable(CAROL)
check("the failed payout is claimable", owed == int(p["yes_cost"]) - math.ceil(int(p["yes_cost"]) * 30 / 10_000), str(owed))
check("nothing is left in flight", view(MARKET, "get_accounting")["in_flight"] == "0")
must("carol rejoins the token", USDC, "storage_deposit", {"account_id": CAROL}, CAROL, deposit="0.01 NEAR")
pay("carol collects it", "withdraw", None, CAROL, expected=owed)
check("claimable is cleared", claimable(CAROL) == 0)
reject("nothing left to withdraw", "Nothing to withdraw", MARKET, "withdraw", {}, CAROL, deposit=ONE_YOCTO, gas="150.0 Tgas")
must("owner cancels the failed-payout market", MARKET, "cancel_market", {"market_id": str(m)}, OWNER)
pay("alice refunds there", "refund", m, ALICE, expected=net_in(2 * USDC_UNIT))

section("permissions")
m = M["far"]
event = M["reserve"]
reject("set_roles is owner only", "Owner only", MARKET, "set_roles", {"operator": ALICE}, ALICE)
reject("set_paused is owner only", "Owner only", MARKET, "set_paused", {"paused": True}, ALICE)
reject("post_receipt is operator only", "Operator only", MARKET, "post_receipt", manual(event, "yes"), ALICE)
reject("arbitrate is arbiter only", "Arbiter only", MARKET, "arbitrate", {"market_id": str(m), "decision": "uphold"}, ALICE)
out = near("contract", "call-function", "as-transaction", MARKET, "arbitrate", "json-args",
           json.dumps({"market_id": str(m), "decision": "uphold"}), "prepaid-gas", "50.0 Tgas", "attached-deposit", "0 NEAR",
           "sign-as", OPERATOR, *NET, "sign-with-access-key-file", OPERATOR_KEY, "send")
check("the limited key cannot call another method", "succeeded" not in out, out[-200:])
out = near("tokens", OPERATOR, "send-near", ALICE, "0.1 NEAR", *NET, "sign-with-access-key-file", OPERATOR_KEY, "send")
check("the limited key cannot move NEAR", "successfully" not in out or "transferred" not in out, out[-200:])
op_reject("receipt before expiry", "Market has not expired", "post_receipt", manual(event, "yes"))
reject("finalize without a receipt", "Nothing to finalize", MARKET, "finalize", {"market_id": str(m)}, BOB)
pay_rejected("redeem before finalize", "Market is not finalized", "redeem", m, ALICE)
pay_rejected("refund while running", "Market is still running", "refund", m, ALICE)
reject("claim_stuck too early", "Too early", MARKET, "claim_stuck", {"market_id": str(event)}, BOB)

section("pause blocks new risk, not exits")
must("owner pauses", MARKET, "set_paused", {"paused": True}, OWNER)
reject("create while paused", "Paused", MARKET, "create_market", create_args(f"paused-{RUN}", "x:bad", rules("event", FAR)), OWNER, deposit="0.3 NEAR")
bet_refused("buy while paused", ALICE, M["sell"], "yes", 2 * USDC_UNIT)
p = position(M["sell"], BOB)
reject("sell while paused", "Paused", MARKET, "sell", {"market_id": str(M["sell"]), "side": "no", "shares": p["no_shares"], "min_out": "0"}, BOB, deposit=ONE_YOCTO, gas="150.0 Tgas")
must("owner resumes", MARKET, "set_paused", {"paused": False}, OWNER)

section("cancel")
m = M["cancel_creator"]
reject("only the creator or owner", "Not allowed", MARKET, "cancel_market", {"market_id": str(m)}, ALICE)
must("creator cancels before any trade", MARKET, "cancel_market", {"market_id": str(m)}, OWNER)
status_is("creator cancel status", m, "cancelled")
m = M["cancel_owner"]
bet("alice bets before the owner cancels", ALICE, m, "yes", 3 * USDC_UNIT)
bet("bob bets before the owner cancels", BOB, m, "no", 5 * USDC_UNIT)
must("owner cancels after trades", MARKET, "cancel_market", {"market_id": str(m)}, OWNER)
pay("alice refunds in full", "refund", m, ALICE, expected=net_in(3 * USDC_UNIT))
pay("bob refunds in full", "refund", m, BOB, expected=net_in(5 * USDC_UNIT))
pay_rejected("no second refund", "NothingToRefund", "refund", m, BOB)
reject("cannot cancel twice", "Market is not open", MARKET, "cancel_market", {"market_id": str(m)}, OWNER)
must("owner cancels the distant price market", MARKET, "cancel_market", {"market_id": str(M["far"])}, OWNER)
pay("alice refunds the distant market", "refund", M["far"], ALICE, expected=net_in(20 * USDC_UNIT))
pay("bob refunds the distant market", "refund", M["far"], BOB, expected=net_in(10 * USDC_UNIT))
m = M["sell"]
must("owner cancels the sell market", MARKET, "cancel_market", {"market_id": str(m)}, OWNER)
p = position(m, ALICE)
pay("seller refunds the remaining stake", "refund", m, ALICE, expected=int(p["yes_cost"]))
pay("other side refunds", "refund", m, BOB, expected=net_in(4 * USDC_UNIT))

section("markets that settle")
EXP = int(time.time()) + 540
M["market_yes"] = create("market resolving YES", f"p1-{RUN}", f"{A}-a", rules("crypto", EXP))
M["same_post"] = create("second market on the same post", f"p1-{RUN}", f"{A}-a", rules("crypto", EXP))
M["market_no"] = create("market resolving NO", f"p2-{RUN}", f"{A}-b", rules("crypto", EXP))
M["market_third"] = create("third market on another author", f"p3-{RUN}", f"{A}-c", rules("crypto", EXP))
M["source_gone"] = create("market whose source goes away", f"p8-{RUN}", f"{A}-h", rules("crypto", EXP))
M["one_sided"] = create("market with one side only", f"p9-{RUN}", f"{A}-i", rules("crypto", EXP))
M["uphold"] = create("event market, challenge lost", f"p4-{RUN}", f"{A}-d", rules("event", EXP))
M["overturn"] = create("event market, challenge won", f"p5-{RUN}", f"{A}-e", rules("event", EXP))
M["slash_ch"] = create("event market, overturned to invalid", f"p6-{RUN}", f"{A}-f", rules("event", EXP))
M["slash_op"] = create("event market, operator reports ambiguous", f"p7-{RUN}", f"{A}-g", rules("event", EXP))
M["silent_op"] = create("operator goes silent", f"p10-{RUN}", f"{A}-j", rules("event", EXP))
M["silent_arb"] = create("arbiter goes silent", f"p11-{RUN}", f"{A}-k", rules("event", EXP))

section("bets on the settling markets")
bet("price YES, alice", ALICE, M["market_yes"], "yes", 20 * USDC_UNIT)
bet("price YES, bob", BOB, M["market_yes"], "no", 10 * USDC_UNIT)
bet("same post, alice", ALICE, M["same_post"], "yes", 2 * USDC_UNIT)
bet("same post, bob", BOB, M["same_post"], "no", 2 * USDC_UNIT)
bet("price NO, alice", ALICE, M["market_no"], "yes", 3 * USDC_UNIT)
bet("price NO, bob", BOB, M["market_no"], "no", 6 * USDC_UNIT)
bet("inverted, alice", ALICE, M["market_third"], "yes", 4 * USDC_UNIT)
bet("inverted, bob", BOB, M["market_third"], "no", 2 * USDC_UNIT)
for key in ("uphold", "overturn", "slash_ch", "slash_op", "source_gone", "silent_arb"):
    bet(f"{key}, alice", ALICE, M[key], "yes", 2 * USDC_UNIT)
    bet(f"{key}, bob", BOB, M[key], "no", 2 * USDC_UNIT)
bet("one side only", ALICE, M["one_sided"], "yes", 3 * USDC_UNIT)
bet("silent operator, alice", ALICE, M["silent_op"], "yes", 5 * USDC_UNIT)
bet("silent operator, bob", BOB, M["silent_op"], "no", 4 * USDC_UNIT)

log(f"\n  settling markets are ready {EXP - int(time.time())}s before expiry")
if time.time() > EXP - 15:
    log("  WARNING: not enough time left for the freeze check")

section("freeze window")
wait_until(EXP - 3)
bet_refused("buy inside the freeze window", ALICE, M["market_yes"], "yes", 2 * USDC_UNIT)

section("receipts: rejected inputs")
wait_until(EXP + 1)
m = M["market_yes"]
op_reject("missing evidence", "Evidence is required", "post_receipt",
          {"market_id": str(m), "report": {"proposed": {"outcome": "yes", "reason": "x"}}, "evidence": {"hash": "", "uri": "", "ai": None}})
op_reject("proposal needs a reason", "A reason is required", "post_receipt",
          {"market_id": str(m), "report": {"proposed": {"outcome": "yes", "reason": ""}}, "evidence": evidence()})
op_reject("invalid needs a reason", "A reason is required", "post_receipt",
          {"market_id": str(M["source_gone"]), "report": {"invalid": {"kind": "source_unavailable", "reason": ""}}, "evidence": evidence()})
op_reject("evidence hash must be a digest", "must be a sha256 hex digest", "post_receipt",
          {"market_id": str(m), "report": {"proposed": {"outcome": "yes", "reason": "x"}}, "evidence": {**evidence(), "hash": "junk"}})
op_reject("a proposal needs a NEAR AI reading", "A NEAR AI reading is required", "post_receipt",
          {"market_id": str(m), "report": {"proposed": {"outcome": "yes", "reason": "x"}}, "evidence": {**evidence(), "ai": None}})
op_reject("oversized AI signature", "Evidence is too long", "post_receipt",
          {"market_id": str(m), "report": {"proposed": {"outcome": "yes", "reason": "x"}},
           "evidence": {**evidence(), "ai": {**AI_READING, "signature": "x" * 201}}})

section("views for the agent")
due = view(MARKET, "get_due_markets", {"limit": 100})
check("due markets are listed", any(d["id"] == str(M["market_yes"]) for d in due))
check("open count is reported", view(MARKET, "get_open_count") >= len(due))

section("receipts")
expected_yes, expected_no, expected_third = True, False, True
op("receipt, YES", "post_receipt", manual(M["market_yes"], "yes"))
op("receipt, same post", "post_receipt", manual(M["same_post"], "yes"))
op("receipt, NO", "post_receipt", manual(M["market_no"], "no"))
op("receipt, third call", "post_receipt", manual(M["market_third"], "yes"))
op("receipt, one side", "post_receipt", manual(M["one_sided"], "yes"))
receipt = market(M["market_yes"])["receipt"]
check("outcome stored", receipt["outcome"] == "yes")
check("reason stored", receipt["reason"] == "Result from the listed source")
check("source hash stored", receipt["evidence"]["hash"] == SNAPSHOT_HASH)
check("AI reading stored", receipt["evidence"]["ai"] == AI_READING)
op("receipt, source gone", "post_receipt", {"market_id": str(M["source_gone"]), "report": {"invalid": {"kind": "source_unavailable", "reason": "The source is offline"}}, "evidence": evidence()})
op("receipt, ambiguous", "post_receipt", {"market_id": str(M["slash_op"]), "report": {"invalid": {"kind": "ambiguous_rules", "reason": "Rules could not be applied"}}, "evidence": evidence()})
op_reject("no second receipt", "Market is not open", "post_receipt", manual(M["market_yes"], "yes"))
op("receipt, uphold case", "post_receipt", manual(M["uphold"], "yes"))
op("receipt, overturn case", "post_receipt", manual(M["overturn"], "yes"))
op("receipt, invalid-overturn case", "post_receipt", manual(M["slash_ch"], "yes"))
op("receipt, silent arbiter case", "post_receipt", manual(M["silent_arb"], "yes"))
reject("finalize inside the window", "Challenge window is still open", MARKET, "finalize", {"market_id": str(M["silent_arb"])}, BOB)
LAST_RECEIPT = time.time()

section("challenge")
m = M["uphold"]
reject("challenge needs the bond", "Attach the challenge bond", MARKET, "challenge", {"market_id": str(m), "reason_uri": "x"}, BOB, deposit="0.01 NEAR")
reject("arbiter cannot challenge", "cannot challenge", MARKET, "challenge", {"market_id": str(m), "reason_uri": "x"}, ARBITER, deposit="0.1 NEAR")
reject("operator cannot challenge", "cannot challenge", MARKET, "challenge", {"market_id": str(m), "reason_uri": "x"}, OPERATOR, deposit="0.1 NEAR")
for key in ("uphold", "overturn", "slash_ch"):
    must(f"bob challenges {key}", MARKET, "challenge", {"market_id": str(M[key]), "reason_uri": "https://example.com/why"}, BOB, deposit="0.1 NEAR")
    status_is(f"{key} is challenged", M[key], "challenged")
must("alice challenges the silent-arbiter market", MARKET, "challenge", {"market_id": str(M["silent_arb"]), "reason_uri": "https://example.com/why"}, ALICE, deposit="0.1 NEAR")
CHALLENGED_AT = time.time()
reject("second challenge", "No receipt to challenge", MARKET, "challenge", {"market_id": str(M["uphold"]), "reason_uri": "x"}, ALICE, deposit="0.1 NEAR")
reject("finalize while challenged", "Nothing to finalize", MARKET, "finalize", {"market_id": str(M["uphold"])}, ALICE)
reject("silent arbiter: too early", "Too early", MARKET, "claim_stuck", {"market_id": str(M["silent_arb"])}, BOB)

section("arbiter")
reject("overturn must change the outcome", "Overturn must change the outcome", MARKET, "arbitrate", {"market_id": str(M["uphold"]), "decision": {"overturn": "yes"}}, ARBITER)
before = near_balance(TREASURY)
must("arbiter upholds", MARKET, "arbitrate", {"market_id": str(M["uphold"]), "decision": "uphold"}, ARBITER)
time.sleep(6)
check("lost challenge bond goes to treasury", near_balance(TREASURY) - before == BOND, str(near_balance(TREASURY) - before))
status_is("upheld outcome stands", M["uphold"], "finalized", "yes")
must("arbiter overturns to NO", MARKET, "arbitrate", {"market_id": str(M["overturn"]), "decision": {"overturn": "no"}}, ARBITER)
status_is("overturned outcome", M["overturn"], "finalized", "no")
before = near_balance(BOB)
must("arbiter overturns to invalid", MARKET, "arbitrate", {"market_id": str(M["slash_ch"]), "decision": {"overturn": {"invalid": "ambiguous_rules"}}}, ARBITER)
time.sleep(6)
gain = near_balance(BOB) - before
check("winning challenger takes both bonds", 2 * BOND <= gain < 2 * BOND + NEAR_UNIT // 100, str(gain))
status_is("invalid outcome", M["slash_ch"], "finalized", {"invalid": "ambiguous_rules"})

section("finalize")
wait_until(LAST_RECEIPT + WINDOW + 3)
reject("challenge after the window", "Challenge window is over", MARKET, "challenge", {"market_id": str(M["one_sided"]), "reason_uri": "x"}, BOB, deposit="0.1 NEAR")
check("finalizable list has the receipts", len(view(MARKET, "get_finalizable", {"limit": 100})) >= 5)
before_treasury = near_balance(TREASURY)
for key in ("market_yes", "same_post", "market_no", "market_third", "one_sided", "source_gone"):
    op(f"finalize {key} with the limited key", "finalize", {"market_id": str(M[key])})
must("anyone can finalize", MARKET, "finalize", {"market_id": str(M["slash_op"])}, BOB)
time.sleep(6)
check("ambiguous rules forfeit the creation bond", near_balance(TREASURY) - before_treasury == BOND, str(near_balance(TREASURY) - before_treasury))
reject("no second finalize", "Nothing to finalize", MARKET, "finalize", {"market_id": str(M["market_yes"])}, BOB)
status_is("YES finalized", M["market_yes"], "finalized", "yes" if expected_yes else "no")
status_is("NO finalized", M["market_no"], "finalized", "yes" if expected_no else "no")
status_is("source-gone finalized", M["source_gone"], "finalized", {"invalid": "source_unavailable"})

section("payouts")
pot = net_in(20 * USDC_UNIT) + net_in(10 * USDC_UNIT)
pay("winner redeems the pot", "redeem", M["market_yes"], ALICE, expected=redeem_net(pot))
pay_rejected("no second redeem", "NothingToRedeem", "redeem", M["market_yes"], ALICE)
pay_rejected("loser cannot redeem", "NothingToRedeem", "redeem", M["market_yes"], BOB)
pay_rejected("no refund on a settled market", "NotCancelled", "refund", M["market_yes"], BOB)
pay("same post winner", "redeem", M["same_post"], ALICE, expected=redeem_net(2 * net_in(2 * USDC_UNIT)))
pot = net_in(3 * USDC_UNIT) + net_in(6 * USDC_UNIT)
pay("NO winner redeems", "redeem", M["market_no"], BOB, expected=redeem_net(pot))
pot = net_in(4 * USDC_UNIT) + net_in(2 * USDC_UNIT)
pay("inverted winner redeems", "redeem", M["market_third"], ALICE, expected=redeem_net(pot))
pot = 2 * net_in(2 * USDC_UNIT)
pay("upheld winner redeems", "redeem", M["uphold"], ALICE, expected=redeem_net(pot))
pay("overturned winner redeems", "redeem", M["overturn"], BOB, expected=redeem_net(pot))
pay_rejected("overturned loser cannot redeem", "NothingToRedeem", "redeem", M["overturn"], ALICE)
for key, who in (("source_gone", ALICE), ("source_gone", BOB), ("slash_op", ALICE), ("slash_op", BOB), ("slash_ch", ALICE), ("slash_ch", BOB)):
    pay(f"{key}: {who.split('-')[-1]} refunds", "refund", M[key], who, expected=net_in(2 * USDC_UNIT))
pay_rejected("no redeem on an invalid market", "NotResolved", "redeem", M["source_gone"], ALICE)
pay("one-sided market refunds", "refund", M["one_sided"], ALICE, expected=net_in(3 * USDC_UNIT))

section("forecasting record")
def record(suffix):
    r = view(MARKET, "get_record", {"author_ref": f"{A}-{suffix}"})
    return r["correct"], r["wrong"]
check("correct call, counted once across two markets on a post", record("a") == (1, 0) if expected_yes else record("a") == (0, 1), str(record("a")))
check("wrong call", record("b") == (0, 1) if not expected_no else record("b") == (1, 0), str(record("b")))
check("inverted call", record("c") == (1, 0), str(record("c")))
check("overturned result counts", record("e") == (0, 1), str(record("e")))
check("invalid market does not count", record("h") == (0, 0), str(record("h")))
check("one-sided market does not count", record("i") == (0, 0), str(record("i")))

section("silent roles")
m = M["silent_op"]
wait_until(EXP + STUCK_AFTER + 3)
must("silent operator: anyone cancels", MARKET, "claim_stuck", {"market_id": str(m)}, BOB)
status_is("silent operator status", m, "cancelled")
p = position(m, ALICE)
pay("alice refunds after a silent operator", "refund", m, ALICE, expected=int(p["yes_cost"]))
pay("bob refunds after a silent operator", "refund", m, BOB, expected=net_in(4 * USDC_UNIT))
m = M["silent_arb"]
wait_until(CHALLENGED_AT + STUCK_AFTER + 3)
before = near_balance(ALICE)
must("silent arbiter: receipt stands", MARKET, "claim_stuck", {"market_id": str(m)}, BOB)
time.sleep(6)
check("challenger gets the bond back", near_balance(ALICE) - before >= BOND, str(near_balance(ALICE) - before))
status_is("silent arbiter outcome", m, "finalized", "yes")
pay("winner redeems after a silent arbiter", "redeem", m, ALICE, expected=redeem_net(2 * net_in(2 * USDC_UNIT)))
reject("a finalized market is not stuck", "Market is not stuck", MARKET, "claim_stuck", {"market_id": str(m)}, BOB)

section("NEAR reserve")
m = M["reserve"]
free = int(view(MARKET, "get_free_near"))
log(f"  free NEAR before draining: {free / NEAR_UNIT:.4f}")
keep = 5 * 10**19
out = near("tokens", MARKET, "send-near", OWNER, f"{free - keep} yoctoNEAR", *NET, "sign-with-legacy-keychain", "send")
time.sleep(4)
check("spare NEAR drained", int(view(MARKET, "get_free_near")) < 10**21, out[-200:])
bet_refused("bet refused rather than spending bonds", ALICE, m, "yes", 2 * USDC_UNIT)
must_out = near("tokens", OWNER, "send-near", MARKET, "0.5 NEAR", *NET, "sign-with-legacy-keychain", "send")
check("top up", "successfully" in must_out, must_out[-200:])
time.sleep(4)
bet("bet works after a top up", ALICE, m, "yes", 2 * USDC_UNIT)
must("owner cancels the reserve market", MARKET, "cancel_market", {"market_id": str(m)}, OWNER)
pay("reserve market refund", "refund", m, ALICE, expected=net_in(2 * USDC_UNIT))

section("fees and solvency")
for who, name in ((TREASURY, "treasury"), (OWNER, "creator")):
    owed = claimable(who)
    check(f"{name} has fees to collect", owed > 0)
    pay(f"{name} withdraws", "withdraw", None, who, expected=owed)
accounting = view(MARKET, "get_accounting")
held = usdc(MARKET)
owed = sum(int(accounting[k]) for k in ("total_pool_collateral", "total_claimable", "in_flight"))
log(f"  contract owes {owed}, holds {held}")
check("in flight is zero", accounting["in_flight"] == "0")
check("contract is solvent", held >= owed)
check("only rounding dust remains", held < 100, str(held))

log(f"\nRESULT {passed} passed, {len(failed)} failed")
for name in failed:
    log(f"  - {name}")
sys.exit(1 if failed else 0)
