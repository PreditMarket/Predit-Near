import { createHash } from 'node:crypto';
import { privateKeyToAccount } from 'viem/accounts';
import { describe, expect, it } from 'vitest';
import { checkEvidence, rulesHash } from '../../../scripts/verify.mjs';
import finalized from './__fixtures__/market-finalized-yes.json';
import { parseSuggestion } from './evidence';

const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

describe('rulesHash', () => {
  it('matches the hash the contract stored for a real market', () => {
    expect(rulesHash(finalized.rules)).toBe(finalized.rules_hash);
  });

  it('changes when one word of the rules changes', () => {
    expect(rulesHash({ ...finalized.rules, yes_condition: `${finalized.rules.yes_condition} ` })).not.toBe(finalized.rules_hash);
  });
});

describe('parseSuggestion', () => {
  it('keeps a clear verdict', () => {
    expect(parseSuggestion({ outcome: 'yes', reason: ' Price was 12. ' })).toEqual({ outcome: 'yes', invalidKind: null, reason: 'Price was 12.' });
  });

  it('never charges the creator unless the model said ambiguous rules', () => {
    expect(parseSuggestion({ outcome: 'invalid', reason: 'x' })?.invalidKind).toBe('source_unavailable');
    expect(parseSuggestion({ outcome: 'invalid', invalidKind: 'nonsense', reason: 'x' })?.invalidKind).toBe('source_unavailable');
    expect(parseSuggestion({ outcome: 'invalid', invalidKind: 'ambiguous_rules', reason: 'x' })?.invalidKind).toBe('ambiguous_rules');
  });

  it.each([null, {}, { outcome: 'maybe', reason: 'x' }, { outcome: 'yes' }, { outcome: 'yes', reason: '  ' }])(
    'refuses %j',
    (raw) => expect(parseSuggestion(raw)).toBeNull(),
  );
});

describe('checkEvidence', () => {
  const signer = privateKeyToAccount(`0x${'1'.repeat(64)}`);
  const text = 'BTC price "quoted" is 12\nline two';
  const question = 'Will BTC be above 10?';
  const requestBody = JSON.stringify({ messages: [{ role: 'user', content: JSON.stringify({ question, snapshot: text }) }] });
  const responseBody = '{"id":"c1","choices":[]}';

  async function fixture() {
    const signedText = `some-model:${sha(requestBody)}:${sha(responseBody)}`;
    const market = {
      id: '7',
      rules: { question, resolution_source: 'https://a.example/s' },
      receipt: {
        outcome: 'yes',
        evidence: {
          hash: sha(text),
          uri: 'https://x/api/evidence/7',
          ai: { model: 'm', chat_id: 'c1', signed_text: signedText, signature: await signer.signMessage({ message: signedText }), signing_address: signer.address },
        },
      },
    };
    const bundle = { marketId: '7', sourceUrl: 'https://a.example/s', snapshot: { text }, ai: { requestBody, responseBody } };
    return { market, bundle };
  }
  const failing = (checks: { name: string; ok: boolean }[]) => checks.filter((c) => !c.ok).map((c) => c.name);

  it('passes honest evidence', async () => {
    const { market, bundle } = await fixture();
    expect(failing(await checkEvidence(market, bundle))).toEqual([]);
  });

  it('catches an edited snapshot', async () => {
    const { market, bundle } = await fixture();
    expect(failing(await checkEvidence(market, { ...bundle, snapshot: { text: 'BTC price is 9' } }))).toEqual([
      'Snapshot matches the hash on chain',
      'The model was sent this snapshot',
    ]);
  });

  it('catches an edited AI response', async () => {
    const { market, bundle } = await fixture();
    expect(failing(await checkEvidence(market, { ...bundle, ai: { ...bundle.ai, responseBody: '{"tampered":1}' } }))).toEqual([
      'Signed response hash matches the published response',
    ]);
  });

  it('catches a signature from another key', async () => {
    const { market, bundle } = await fixture();
    market.receipt.evidence.ai.signing_address = privateKeyToAccount(`0x${'2'.repeat(64)}`).address;
    expect(failing(await checkEvidence(market, bundle))).toEqual(['Signature recovers to the signer on chain']);
  });

  it('catches evidence from another market or source', async () => {
    const { market, bundle } = await fixture();
    expect(failing(await checkEvidence(market, { ...bundle, marketId: '8', sourceUrl: 'https://b.example' }))).toEqual([
      'Evidence is for this market',
      'Snapshot is of the source locked in the rules',
    ]);
  });

  it('lets an invalid result stand without an AI reading, but not a YES', async () => {
    const { market, bundle } = await fixture();
    const noAi = { ...market.receipt.evidence, ai: null };
    expect(failing(await checkEvidence({ ...market, receipt: { outcome: { invalid: 'source_unavailable' }, evidence: noAi } }, bundle))).toEqual([]);
    expect(failing(await checkEvidence({ ...market, receipt: { outcome: 'yes', evidence: noAi } }, bundle))).toEqual(['Result needs no AI reading']);
  });
});
