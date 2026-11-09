#!/usr/bin/env bash
# Builds both contracts to target/near/.
set -euo pipefail
cd "$(dirname "$0")"
(cd market && cargo near build non-reproducible-wasm)
(cd mock-usdc && cargo near build non-reproducible-wasm)
