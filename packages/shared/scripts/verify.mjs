#!/usr/bin/env node
// Checks a market's result receipt against its public evidence. No account or key needed.
//   pnpm verify <market id>
// This shows what NEAR AI read and answered. It cannot show that the result is correct:
// that rests on the person who confirmed it and on the challenge window.
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { recoverMessageAddress } from 'viem';

const RPC = process.env.NEAR_RPC_URL ?? 'https://test.rpc.fastnear.com';
const CONTRACT = process.env.NEAR_MARKET_CONTRACT ?? 'predit-markets-market.testnet';
const AI_API = 'https://cloud-api.near.ai/v1';

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

/** What the model was sent, as text, or null when the body isn't a chat request. */
function promptOf(requestBody) {
  try {
    return JSON.parse(requestBody).messages.map((message) => message.content).join('\n');
  } catch {
    return null;
  }
}

/** The evidence checks for one market, each `{ name, ok, detail }`. */
export async function checkEvidence(market, bundle) {
  const { receipt } = market;
  const checks = [];
  const add = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail });

  const textHash = sha256(bundle.snapshot.text);
  add('Snapshot matches the hash on chain', textHash === receipt.evidence.hash, textHash);
  add('Evidence is for this market', String(bundle.marketId) === String(market.id));
  add('Snapshot is of the source locked in the rules', bundle.sourceUrl === market.rules.resolution_source, bundle.sourceUrl);

  const reading = receipt.evidence.ai;
  if (!reading) {
    add('Result needs no AI reading', typeof receipt.outcome === 'object', 'Only an invalid result may omit it');
    return checks;
  }
  const ai = bundle.ai;
  if (!ai) {
    add('Evidence carries the AI request and response', false);
    return checks;
  }
  const [requestHash, responseHash] = reading.signed_text.split(':').slice(-2);
  add('Signed request hash matches the published request', requestHash === sha256(ai.requestBody), requestHash);
  add('Signed response hash matches the published response', responseHash === sha256(ai.responseBody), responseHash);

  const prompt = promptOf(ai.requestBody);
  add('The model was sent this snapshot', !!prompt && prompt.includes(JSON.stringify(bundle.snapshot.text).slice(1, -1)));
  add('The model was asked about this market', !!prompt && prompt.includes(JSON.stringify(market.rules.question).slice(1, -1)));

  let signer = null;
  try {
    signer = await recoverMessageAddress({ message: reading.signed_text, signature: reading.signature });
  } catch {
    // Reported as a failed check below.
  }
  add('Signature recovers to the signer on chain', signer?.toLowerCase() === reading.signing_address.toLowerCase(), signer ?? 'unreadable signature');
  return checks;
}

/** The NEAR AI verdict in the published response, to compare with what the person confirmed. */
export function aiVerdict(bundle) {
  try {
    const content = JSON.parse(bundle.ai.responseBody).choices[0].message.content;
    return JSON.parse(content.match(/\{[\s\S]*\}/)[0]);
  } catch {
    return null;
  }
}

async function viewMarket(id) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'query',
      params: {
        request_type: 'call_function',
        finality: 'final',
        account_id: CONTRACT,
        method_name: 'get_market',
        args_base64: Buffer.from(JSON.stringify({ market_id: id })).toString('base64'),
      },
    }),
  });
  const { result, error } = await res.json();
  if (!result?.result) throw new Error(`Could not read the market: ${JSON.stringify(error ?? result)}`);
  return JSON.parse(Buffer.from(result.result).toString());
}

/** Whether NEAR AI's current report lists the signer. Needs NEAR_AI_API_KEY, so it is optional. */
async function attestedSigner(reading) {
  const key = process.env.NEAR_AI_API_KEY?.trim();
  if (!key) return 'skipped: set NEAR_AI_API_KEY, or paste the chat id at https://cloud.near.ai/verify';
  const nonce = createHash('sha256').update(String(Date.now())).digest('hex');
  const query = new URLSearchParams({ model: reading.model, signing_algo: 'ecdsa', provider: 'near', nonce });
  const res = await fetch(`${AI_API}/attestation/report?${query}`, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) return `unavailable: NEAR AI answered ${res.status}`;
  const report = await res.json();
  const signers = (report.model_attestations ?? []).map((a) => a.signing_address?.toLowerCase());
  return signers.includes(reading.signing_address.toLowerCase())
    ? 'listed in the current report (the Intel TDX quote itself is not checked here)'
    : 'not in the current report: the enclave may have rotated, check at https://cloud.near.ai/verify';
}

async function main() {
  const id = process.argv[2];
  if (!id || !/^\d+$/.test(id)) {
    console.error('Usage: pnpm verify <market id>');
    process.exit(2);
  }
  const market = await viewMarket(id);
  if (!market) throw new Error(`No market ${id} on ${CONTRACT}`);
  if (!market.receipt) throw new Error(`Market ${id} has no receipt yet`);

  console.log(`Market ${id}: ${market.rules.question}`);
  console.log(`Result on chain: ${JSON.stringify(market.receipt.outcome)}\nReason: ${market.receipt.reason}`);
  console.log(`Evidence: ${market.receipt.evidence.uri}\n`);

  const res = await fetch(market.receipt.evidence.uri);
  if (!res.ok) throw new Error(`Evidence answered ${res.status}`);
  const bundle = await res.json();

  const checks = await checkEvidence(market, bundle);
  for (const { name, ok, detail } of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);

  if (market.receipt.evidence.ai) {
    const verdict = aiVerdict(bundle);
    console.log(`\nNEAR AI answered: ${verdict?.outcome ?? 'unknown'}${verdict?.reason ? `, "${verdict.reason}"` : ''}`);
    console.log(`Signer attestation: ${await attestedSigner(market.receipt.evidence.ai)}`);
  }
  console.log('\nThis shows what NEAR AI read and answered, not that the result is correct.');
  if (checks.some((check) => !check.ok)) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
