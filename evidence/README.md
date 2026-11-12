# Evidence copies

Each settled market's receipt links its evidence bundle: the source snapshot, the exact request sent to NEAR AI, its response and the enclave's signature. Only their hashes and the signature are on chain, so a copy proves as much as the original.

| File | Market | Link on chain |
|---|---|---|
| `37.json` | Vitalik Buterin's zkAPI branch, drafted by NEAR AI, created by a new account | `https://predit-near-internal.up.railway.app/api/evidence/37` |
| `36.json` | The Games With Real Economies track on nearhackathon.com | a local server that was not public |

```bash
pnpm verify 37                                   # reads the evidence from its link on chain
pnpm verify 37 --evidence evidence/37.json       # the same check on this copy
pnpm verify 36 --evidence evidence/36.json
```

Change one character of `snapshot.text` and the snapshot check fails.
