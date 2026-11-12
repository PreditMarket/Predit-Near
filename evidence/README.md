# Evidence copies

The receipt of market 36 on `predit-markets-market.testnet` links its evidence on the server that settled it, which was not public yet. This is the same bundle: the source snapshot, the exact request sent to NEAR AI, its response and the enclave's signature. The hash on chain decides whether a copy is genuine:

```bash
pnpm verify 36 --evidence evidence/36.json
```

Change one character of `snapshot.text` and the first check fails.
