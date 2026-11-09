import { describe, expect, it } from 'vitest';
import { fitBytes, MAX_LABEL, MAX_SHORT, parseDetection, parseDraft, textBytes } from './market-draft';

const NOW = Date.parse('2026-11-10T00:00:00Z');
const GOOD = {
  question: 'Will BTC close above 150,000 USD on 31 March 2027?',
  description: 'The post expects a new high.',
  yesLabel: 'Above',
  noLabel: 'Below',
  yesCondition: 'CoinGecko shows BTC above 150,000 USD at the deadline.',
  noCondition: 'CoinGecko shows BTC at or below 150,000 USD at the deadline.',
  invalidConditions: 'CoinGecko is unreachable.',
  source: 'https://www.coingecko.com/en/coins/bitcoin',
  deadline: '2027-03-31T23:59:00Z',
  category: 'Crypto',
  claimSide: 'no',
};

describe('parseDraft', () => {
  it('keeps a complete draft', () => {
    expect(parseDraft(GOOD, NOW)).toEqual({
      ...GOOD,
      deadline: undefined,
      deadlineMs: Date.parse(GOOD.deadline),
      category: 'crypto',
    } as never);
  });

  it.each([null, 'text', {}, { ...GOOD, question: '  ' }, { ...GOOD, yesCondition: 5 }, { ...GOOD, noCondition: '' }])(
    'refuses a reply that cannot start a market: %j',
    (raw) => expect(parseDraft(raw, NOW)).toBeNull(),
  );

  it.each([
    'http://www.coingecko.com/x',
    'https://localhost/x',
    'https://169.254.169.254/latest',
    'https://[::1]/x',
    'https://user:pw@example.com/x',
    'javascript:alert(1)',
    'see coingecko',
    42,
  ])('drops an unusable source: %j', (source) => {
    expect(parseDraft({ ...GOOD, source }, NOW)?.source).toBe('');
  });

  it.each([
    ['past', '2026-01-01T00:00:00Z'],
    ['too soon', '2026-11-10T01:00:00Z'],
    ['past the contract limit', '2040-01-01T00:00:00Z'],
    ['not a date', 'soon'],
  ])('drops a deadline that is %s', (_name, deadline) => {
    expect(parseDraft({ ...GOOD, deadline }, NOW)?.deadlineMs).toBeNull();
  });

  it('rounds a deadline up to the whole minute', () => {
    expect(parseDraft({ ...GOOD, deadline: '2027-03-31T23:59:59Z' }, NOW)?.deadlineMs).toBe(Date.parse('2027-04-01T00:00:00Z'));
  });

  it('falls back on labels that are missing or the same', () => {
    expect(parseDraft({ ...GOOD, noLabel: '' }, NOW)).toMatchObject({ yesLabel: 'Yes', noLabel: 'No' });
    expect(parseDraft({ ...GOOD, noLabel: 'Above' }, NOW)).toMatchObject({ yesLabel: 'Yes', noLabel: 'No' });
  });

  it('coerces unknown category and side', () => {
    expect(parseDraft({ ...GOOD, category: 'memes', claimSide: 'maybe' }, NOW)).toMatchObject({
      category: 'other',
      claimSide: 'yes',
    });
  });

  it('fits the contract byte limits, counting bytes and not characters', () => {
    const draft = parseDraft({ ...GOOD, question: 'é'.repeat(300), yesLabel: 'ü'.repeat(50) }, NOW);
    expect(textBytes(draft?.question ?? '')).toBeLessThanOrEqual(MAX_SHORT);
    expect(textBytes(draft?.yesLabel ?? '')).toBeLessThanOrEqual(MAX_LABEL);
  });

  it('supplies an invalid rule when the model left it out', () => {
    expect(parseDraft({ ...GOOD, invalidConditions: '' }, NOW)?.invalidConditions).toContain('cannot be read');
  });
});

describe('parseDetection', () => {
  it('keeps a detected claim', () => {
    expect(parseDetection({ detected: true, claim: ' BTC hits 150k ' })).toEqual({ detected: true, claim: 'BTC hits 150k' });
  });

  it('ignores a claim on a post with no prediction', () => {
    expect(parseDetection({ detected: false, claim: 'x' })).toEqual({ detected: false, claim: '' });
  });

  it('does not show a detection with nothing to say', () => {
    expect(parseDetection({ detected: true, claim: '' })).toEqual({ detected: false, claim: '' });
  });

  it.each([null, {}, { detected: 'yes' }])('refuses %j', (raw) => expect(parseDetection(raw)).toBeNull());
});

describe('fitBytes', () => {
  it('never splits a character', () => expect(fitBytes('aé', 2)).toBe('a'));
});
