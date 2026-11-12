#!/usr/bin/env bash
# Runs Predit on NEAR testnet with no keys or accounts.
#   ./demo.sh               install, check a settled market's receipt, unit tests, start the app
#   ./demo.sh --e2e         also run the Playwright suite (signs nothing)
#   ./demo.sh --contracts   also build the contracts and run the Rust tests
#   ./demo.sh --no-start    stop before starting the app
set -euo pipefail
cd "$(dirname "$0")"

E2E=0; CONTRACTS=0; START=1
for arg in "$@"; do
  case "$arg" in
    --e2e) E2E=1 ;;
    --contracts) CONTRACTS=1 ;;
    --no-start) START=0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

PORT="${PORT:-3000}"
step() { printf '\n\033[1;36m== %s\033[0m\n' "$1"; }
need() { command -v "$1" >/dev/null || { echo "Missing $1. $2" >&2; exit 1; }; }

step "Tools"
need node "Install Node 20 or newer."
node -e 'process.exit(+process.versions.node.split(".")[0] >= 20 ? 0 : 1)' || { echo "Node 20 or newer is needed." >&2; exit 1; }
if ! command -v pnpm >/dev/null; then corepack enable >/dev/null 2>&1 || true; fi
need pnpm "Run: corepack enable (the version is pinned in package.json)."
echo "node $(node -v), pnpm $(pnpm -v)"

step "Install"
pnpm install --frozen-lockfile

step "A settled market, checked from the chain with no key (market 36)"
pnpm -s verify 36 --evidence evidence/36.json

step "The same check on a tampered copy of the evidence (should FAIL)"
TAMPERED="$(mktemp -t predit-evidence.XXXXXX)"
node -e '
  const fs = require("fs");
  const b = JSON.parse(fs.readFileSync("evidence/36.json", "utf8"));
  b.snapshot.text = b.snapshot.text.replace("Games With Real Economies", "Games With Fake Economies");
  fs.writeFileSync(process.argv[1], JSON.stringify(b));
' "$TAMPERED"
if pnpm -s verify 36 --evidence "$TAMPERED"; then echo "Expected a failure" >&2; exit 1; fi
rm -f "$TAMPERED"
echo "Rejected, as it should be."

step "Unit tests"
pnpm -s test

if [ "$CONTRACTS" = 1 ]; then
  step "Contracts: build and Rust tests"
  need cargo "Install Rust with rustup; the toolchain is pinned in contracts/rust-toolchain.toml."
  need cargo-near "Run: cargo install cargo-near --version 0.23.0 --locked"
  (cd contracts && ./build.sh && cargo test)
fi

step "Build the web app"
pnpm build

if [ "$E2E" = 1 ]; then
  step "End-to-end tests (reads testnet, signs nothing)"
  pnpm --filter web exec playwright install chromium
  pnpm e2e
fi

[ "$START" = 1 ] || exit 0

step "Predit is starting on http://localhost:$PORT"
cat <<EOF
Try:
  1. Open http://localhost:$PORT. The feed shows posts with markets under them, read from
     predit-markets-market.testnet.
  2. Open http://localhost:$PORT/market/36 to see a settled market: its locked rules,
     the result receipt and the NEAR AI reading it was based on.
  3. Open http://localhost:$PORT/u/NEARProtocol to see an author's record kept by the contract.
  4. Connect a NEAR testnet wallet to take a position, create a market from a post
     or deposit test USDC (the Deposit dialog has a faucet).
With no keys the feed uses sample posts and the NEAR AI features are off; see README.
EOF
PORT="$PORT" pnpm --filter web exec next start -p "$PORT"
